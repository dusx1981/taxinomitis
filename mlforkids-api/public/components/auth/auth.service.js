(function () {

    angular
        .module('app')
        .service('authService', authService);

    var angDependencies = [
        'authManager', 'loggerService', 'storageService', 'browserStorageService',
        '$q', '$http',
        '$mdDialog',
        '$rootScope',
        '$window',
        '$state',
        '$timeout'
    ];
    if (AUTH0_CLIENT_ID) {
        angDependencies.push('lock');
    }

    authService.$inject = angDependencies;

    function authService(authManager, loggerService, storageService, browserStorageService, $q, $http, $mdDialog, $rootScope, $window, $state, $timeout, lock) {

        var SESSION_USERS_CLASS = 'session-users';

        // 为了避免会话过期，界面会在后台静默刷新访问令牌
        // 我们会在令牌过期前10分钟进行刷新，以避免时间窗口风险
        // 这个常量定义了在令牌过期前多久我们会尝试刷新
        var TEN_MINUTES_MILLISECS = 600000;

        var vm = this;

        // 如果用户以注册用户身份登录，我们会在其令牌过期前尝试刷新
        // 以防止他们在活动期间被登出
        // 这个计时器用于实现此功能
        var nextRefreshTimer = null;

        $rootScope.isTeacher = false;
        $rootScope.isAuthenticated = false;

        loggerService.debug('[ml4kauth] 初始化');
        storageService.confirmLocalStorage();

        var userProfileStr = storageService.getItem('profile');
        var userProfile = null;
        if (userProfileStr) {
            userProfile = JSON.parse(userProfileStr);
        }
        var deferredProfile = $q.defer();

        if (userProfile) {
            loggerService.debug('[ml4kauth] 已恢复现有用户资料');

            if (hasSessionExpired()) {
                loggerService.debug('[ml4kauth] 会话已过期');

                // 我们在本地存储中找到了访问令牌，但它已过期
                // 所以我们会清除它并强制用户重新登录
                logout();
            }
            else {
                loggerService.debug('[ml4kauth] 设置已恢复的资料供使用');

                deferredProfile.resolve(userProfile);

                $rootScope.isTeacher = (userProfile.role === 'supervisor');
                $rootScope.isAuthenticated = true;

                if (Sentry) {
                    Sentry.configureScope(function (scope) {
                        scope.setUser({
                            email : userProfile.email,
                            username : userProfile.user_id
                        });
                        scope.setExtra('role', userProfile.role);
                        scope.setExtra('tenant', userProfile.tenant);
                    });
                }

                // 尝试在用户仍处于活动状态时保持登录状态
                // 通过在后台刷新他们的访问令牌
                // 这不适用于"立即试用"用户，因为这些会话无法续期
                if (userProfile.tenant !== SESSION_USERS_CLASS) {
                    var expiresAt = JSON.parse(storageService.getItem('expires_at'));
                    var refreshTime = expiresAt - TEN_MINUTES_MILLISECS;
                    var timeToRefresh = refreshTime - (new Date().getTime());
                    if (timeToRefresh > 0) {
                        loggerService.debug('[ml4kauth] 令牌有效时间超过10分钟');
                        scheduleTokenRenewal(timeToRefresh);
                    }
                    else {
                        loggerService.debug('[ml4kauth] 令牌将在10分钟内需要续期');

                        // 会话将在10分钟内过期，因此立即刷新
                        renewLogin();
                    }
                }
            }
        }


        function scheduleTokenRenewal(timeToRefreshMs) {
            loggerService.debug('[ml4kauth] 安排令牌续期');
            nextRefreshTimer = setTimeout(renewLogin, timeToRefreshMs);
        }


        function renewLogin() {
            loggerService.debug('[ml4kauth] 续期登录');

            if (lock) {
                lock.checkSession({}, function (err, authres) {
                    if (err) {
                        loggerService.error('[ml4kauth] 登录续期失败', err);
                    }
                    else if (authres) {
                        loggerService.debug('[ml4kauth] 登录已续期', authres);

                        storeToken(authres);

                        // 安排下一次续期！
                        var expiresInSeconds = authres.expiresIn;
                        var expiresInMillisecs = expiresInSeconds * 1000;
                        var timeToRefreshLogin = expiresInMillisecs - TEN_MINUTES_MILLISECS;
                        if (timeToRefreshLogin > 0) {
                            scheduleTokenRenewal(timeToRefreshLogin);
                        }
                    }
                });
            }
            else {
                loggerService.error('[ml4kauth] 意外的 renewLogin 调用');
            }
        }


        function login() {
            loggerService.debug('[ml4kauth] 登录');
            if (lock) {
                lock.show({
                    languageDictionary : {
                        title: '登录儿童机器学习'
                    }
                });
            }
            else {
                loggerService.error('[ml4kauth] 意外的登录调用');
            }
        }

        function reset() {
            loggerService.debug('[ml4kauth] 重置');
            if (lock) {
                lock.show({
                    languageDictionary : {
                        title: '忘记密码？'
                    },

                    allowForgotPassword : true,
                    allowLogin : false,

                    initialScreen : 'forgotPassword'
                });
            }
            else {
                loggerService.error('意外的重置调用');
            }
        }


        function clearAuthData() {
            loggerService.debug('[ml4kauth] 清除认证数据');

            if (nextRefreshTimer) {
                loggerService.debug('[ml4kauth] 清除令牌续期计时器');
                clearTimeout(nextRefreshTimer);
                nextRefreshTimer = null;
            }

            deferredProfile = $q.defer();

            loggerService.debug('[ml4kauth] 清除存储的令牌');
            storageService.removeItem('access_token');
            storageService.removeItem('id_token');
            storageService.removeItem('expires_at');
            storageService.removeItem('scopes');
            storageService.removeItem('profile');

            authManager.unauthenticate();

            userProfile = null;
            $rootScope.isTeacher = false;
            $rootScope.isAuthenticated = false;

            $rootScope.$broadcast('authStateChange', '已清除认证数据');
        }

        function logout() {
            loggerService.debug('[ml4kauth] 登出');

            if (userProfile && userProfile.tenant === SESSION_USERS_CLASS && authManager.isAuthenticated()) {
                loggerService.debug('[ml4kauth] 登出会话用户');
                deleteSessionUser(userProfile.user_id)
                    .then(function () {
                        loggerService.debug('[ml4kauth] 已删除会话用户');
                        clearAuthData();
                        storageService.clear();

                        return browserStorageService.deleteSessionUserProjects();
                    })
                    .catch(function (err) {
                        loggerService.error('[ml4kauth] 删除会话用户失败', err);
                    });
            }
            else {
                clearAuthData();
            }
        }


        function storeToken(authResult) {
            loggerService.debug('[ml4kauth] 存储令牌');

            var expiresAt = JSON.stringify((authResult.expiresIn * 1000) + new Date().getTime());

            var scopes = authResult.scope || REQUESTED_SCOPES || '';

            storageService.setItem('access_token', authResult.accessToken);
            storageService.setItem('id_token', authResult.idToken);
            storageService.setItem('expires_at', expiresAt);
            storageService.setItem('scopes', JSON.stringify(scopes));

            authManager.authenticate();
        }

        function storeProfile(profile) {
            loggerService.debug('[ml4kauth] 存储资料');

            storageService.setItem('profile', JSON.stringify(profile));
            deferredProfile.resolve(profile);

            $rootScope.isTeacher = (profile.role === 'supervisor');
            $rootScope.isAuthenticated = true;
        }


        function extractAppMetadata(profile) {
            loggerService.debug('[ml4kauth] 从资料数据中提取应用元数据');

            var tenant = profile['https://machinelearningforkids.co.uk/api/tenant'];
            var role = profile['https://machinelearningforkids.co.uk/api/role'];
            var groups = profile['https://machinelearningforkids.co.uk/api/groups'];
            var user_id = profile.sub;
            profile.tenant = tenant;
            profile.role = role;
            profile.groups = groups;
            profile.user_id = user_id;
            delete profile['https://machinelearningforkids.co.uk/api/tenant'];
            delete profile['https://machinelearningforkids.co.uk/api/role'];
            delete profile['https://machinelearningforkids.co.uk/api/groups'];
            delete profile.sub;
            delete profile.picture;
            return profile;
        }


        function setupAuth() {
            loggerService.debug('[ml4kauth] 设置认证');

            if (lock) {
                loggerService.debug('[ml4kauth] 注册URL拦截器');
                lock.interceptHash();

                lock.on('authenticated', function (authResult) {
                    loggerService.debug('[ml4kauth] 已认证');

                    if (authResult && authResult.accessToken && authResult.idToken) {
                        loggerService.debug('[ml4kauth] 收到预期的认证令牌');

                        storeToken(authResult);

                        loggerService.debug('[ml4kauth] 检索用户信息');
                        lock.getUserInfo(authResult.accessToken, function (err, profile) {
                            if (err) {
                                loggerService.error('[ml4kauth] lock 认证失败', err);
                                return logout();
                            }

                            loggerService.debug('[ml4kauth] 处理检索到的资料');
                            vm.profile = extractAppMetadata(profile);
                            storeProfile(vm.profile);

                            // 在令牌即将过期前安排刷新
                            var expiresInSeconds = authResult.expiresIn;
                            var expiresInMillisecs = expiresInSeconds * 1000;
                            var timeToRefreshLogin = expiresInMillisecs - TEN_MINUTES_MILLISECS;
                            scheduleTokenRenewal(timeToRefreshLogin);

                            loggerService.debug('[ml4kauth] 重定向到主页');
                            $timeout(function () {
                                $state.go('welcome');
                                $rootScope.$broadcast('authStateChange', '认证完成');
                            });
                        });
                    }
                    else {
                        loggerService.error('[ml4kauth] 认证但未收到预期令牌');
                        loggerService.error(authResult);
                    }
                });

                lock.on('authorization_error', function (err) {
                    loggerService.warn('[ml4kauth] 授权错误', err);

                    if (err && err.errorDescription) {
                        if (err.errorDescription === 'Please verify your email to activate your class account') {
                            alert('请验证您的电子邮件以激活您的班级账户\n\n' +
                                '创建账户时，您应该收到了一封验证邮件。\n' +
                                '点击该邮件中的链接将激活您的班级账户。\n\n' +
                                '请点击帮助选项卡获取更多信息');
                        }
                    }
                    $rootScope.$broadcast('authStateChange', '授权错误');
                });

                // auth0 看起来完全坏了，尝试重新开始
                lock.on('unrecoverable_error', function (err) {
                    loggerService.error('[ml4kauth] 不可恢复的认证错误', err);

                    logout();
                    return $window.location.reload(true);
                });
            }

            // 会话过期后，告诉用户发生了什么
            $rootScope.$on('tokenHasExpired', sessionExpired);
        }


        function sessionExpired() {
            loggerService.debug('[ml4kauth] 会话已过期');

            clearAuthData();

            var alert = $mdDialog.alert()
                                .title('会话已过期')
                                .textContent('请重新登录。')
                                .ok('确定');
            $mdDialog.show(alert).finally(function () {
                $state.go('login');
            });
        }


        function handleUnauthenticated() {
            loggerService.debug('[ml4kauth] 未认证事件');

            if (hasSessionExpired()) {
                loggerService.debug('[ml4kauth] 未认证因为会话已过期');
                sessionExpired();
            }
            else {
                loggerService.debug('[ml4kauth] 意外的未认证事件');
                clearAuthData();
                $state.go('login');
            }
        }

        function getProfileDeferred() {
            return deferredProfile.promise;
        }

        function isAuthenticated() {
            loggerService.debug('[ml4kauth] 检查是否已认证');

            if (userProfile) {
                // 检查当前时间是否超过访问令牌的过期时间
                var expired = hasSessionExpired();
                if (expired) {
                    logout();
                }
                return !expired;
            }
            return false;
        }

        function hasSessionExpired() {
            var expired = false;
            if (userProfile) {
                // 检查当前时间是否超过访问令牌的过期时间
                var expiresAt = JSON.parse(storageService.getItem('expires_at'));
                expired = (new Date().getTime() > expiresAt);
            }
            loggerService.debug('[ml4kauth] 会话是否过期 : ' + expired);
            return expired;
        }


        function switchToSessionUser(userinfo) {
            loggerService.debug('[ml4kauth] 切换到会话用户');

            // 清除任何现有的用户/认证信息
            logout();

            loggerService.debug('[ml4kauth] 存储资料数据');
            storageService.setItem('access_token', userinfo.token);
            storageService.setItem('id_token', userinfo.jwt);

            var expiryTime = JSON.stringify(new Date(userinfo.sessionExpiry).getTime());
            storageService.setItem('expires_at', expiryTime);

            storageService.setItem('scopes', 'openid email');

            userProfile = {
                tenant : SESSION_USERS_CLASS,
                role : 'student',
                user_id : userinfo.id
            };

            storageService.setItem('profile', JSON.stringify(userProfile));
            deferredProfile.resolve(userProfile);

            $rootScope.isAuthenticated = true;
            $rootScope.isTeacher = false;

            $rootScope.$broadcast('authStateChange', '已切换到会话用户');
        }



        function createSessionUser() {
            loggerService.debug('[ml4kauth] 创建会话用户');
            return $http.post('/api/sessionusers')
                .then(function (resp) {
                    loggerService.debug('[ml4kauth] 会话用户已创建');

                    var sessionuser = resp.data;

                    switchToSessionUser(sessionuser);

                    return sessionuser;
                });
        }

        function deleteSessionUser(userid) {
            loggerService.debug('[ml4kauth] 删除会话用户');
            return $http.delete('/api/classes/' + SESSION_USERS_CLASS + '/sessionusers/' + userid)
                .catch(function (err) {
                    loggerService.error('[ml4kauth] 删除会话用户失败', err);
                });
        }


        function parseUrlParams(input) {
            var params = {};
            input.split('&').forEach(function (str) {
                var pair = str.split('=');
                params[pair[0]] = pair[1];
            });
            return params;
        }


        function checkForAuthMessagesInUrl() {
            var paramStr = $window.location.search;
            if (paramStr &&
                paramStr[0] === '?')
            {
                var params = parseUrlParams(paramStr.substring(1));

                if (params.message === 'Your%20email%20was%20verified.%20You%20can%20continue%20using%20the%20application.')
                {
                    var alert = $mdDialog.alert()
                                    .title('欢迎使用儿童机器学习')
                                    .textContent('您的电子邮件地址已验证。')
                                    .ok('确定');
                    $mdDialog.show(alert).finally(function () {
                        $window.location = '/';
                    });
                }
            }
        }



        return {
            login : login,
            reset : reset,
            logout : logout,

            setupAuth : setupAuth,
            getProfileDeferred : getProfileDeferred,
            isAuthenticated : isAuthenticated,

            handleUnauthenticated : handleUnauthenticated,

            createSessionUser : createSessionUser,

            checkForAuthMessagesInUrl : checkForAuthMessagesInUrl,

            storeProfile : storeProfile
        };
    }
})();