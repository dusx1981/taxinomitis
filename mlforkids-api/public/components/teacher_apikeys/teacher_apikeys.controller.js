(function () {

    angular
        .module('app')
        .controller('TeacherApiKeysController', TeacherApiKeysController);

    TeacherApiKeysController.$inject = [
        'authService',
        'usersService',
        '$mdDialog', '$document', '$timeout', 'loggerService'
    ];

    function TeacherApiKeysController(authService, usersService, $mdDialog, $document, $timeout, loggerService) {

        var vm = this;
        vm.authService = authService;

        vm.CONSTANTS = {
            UNKNOWN : -1,
            UNLIMITED : -2
        };

        var alertId = 1;
        vm.errors = [];
        vm.warnings = [];
        vm.dismissAlert = function (type, errIdx) {
            vm[type].splice(errIdx, 1);
        };
        function displayAlert(type, status, errObj) {
            if (!errObj) {
                errObj = {};
            }
            var newId = alertId++;
            vm[type].push({
                alertid : newId,
                message : errObj.message || errObj.error || '未知错误',
                status : status
            });
            return newId;
        }


        function computeLimit(type) {
            loggerService.debug('[ml4kapi] 计算 ' + type + ' 的限制');
            var creds = vm.credentials[type];

            var mlmodels = 0;
            for (var i = 0; i < creds.length; i++) {
                var cred = creds[i];
                if (cred.credstype === 'conv_lite' || cred.credstype === 'conv_plustrial') {
                    mlmodels += 5;
                }
                else if (cred.credstype === 'conv_standard') {
                    mlmodels += 20;
                }
                else if (cred.credstype === 'conv_plus') {
                    mlmodels += 50;
                }
                else {
                    mlmodels = vm.CONSTANTS.UNKNOWN;
                    break;
                }
            }
            vm.credentials.totals[type] = mlmodels;
        }

        function getCredentials(profile, type) {
            loggerService.debug('[ml4kapi] 检索 IBM 凭证 (' + type + ')');
            usersService.getCredentials(profile, type)
                .then(function (creds) {
                    loggerService.debug('[ml4kapi] 获取到 IBM 凭证 (' + type + ')');

                    vm.credentials[type] = creds;
                    vm.credentials.loading[type] = false;

                    computeLimit(type);
                })
                .catch(function (err) {
                    loggerService.error('[ml4kapi] 获取凭证失败 (' + type + ')', err);

                    vm.credentials.failed[type] = true;
                    vm.credentials.loading[type] = false;
                    displayAlert('errors', err.status, err.data);
                });
        }


        function getAllCredentials(profile) {
            vm.credentials = {
                loading : {
                    conv : true
                },
                failed : {
                    conv : false
                },
                totals : {
                    conv : vm.CONSTANTS.UNKNOWN
                }
            };
            getCredentials(profile, 'conv');
        }



        authService.getProfileDeferred()
            .then(function (profile) {
                vm.profile = profile;

                if (profile.role === 'supervisor') {

                    usersService.getClassPolicy(profile)
                        .then(function (policy) {
                            vm.policy = policy;

                            if (vm.policy.isManaged === false) {
                                getAllCredentials(profile);
                            }
                        })
                        .catch(function (err) {
                            displayAlert('errors', err.status, err.data);
                        });
                }
            })
            .catch(function (err) {
                displayAlert('errors', err.status, err.data);
            });


        vm.verifyCredentials = function (ev, creds) {
            loggerService.debug('[ml4kapi] 验证 IBM 凭证');
            creds.verifying = true;

            usersService.verifyCredentials(vm.profile, creds)
                .then(function () {
                    loggerService.debug('[ml4kapi] 验证成功');
                    creds.verified = true;
                    creds.verifying = false;
                })
                .catch(function (err) {
                    loggerService.error('[ml4kapi] 检查失败', err);

                    creds.verified = false;
                    creds.verifying = false;

                    var errMessage = '';
                    if (err && err.data && err.data.error) {
                        errMessage = err.data.error;
                    }

                    var details = $mdDialog.alert()
                            .title('IBM Watson 拒绝了您的 API 密钥')
                            .htmlContent('<div class="confirmdialogsmall">' +
                                creds.apikey + ' 被 IBM 拒绝。' +
                                (errMessage ? '<div>响应为：' + errMessage + '</div>' : '') +
                                '</div>')
                            .ok('确定');
                    $mdDialog.show(details);
                });
        };

        vm.deleteCredentials = function (ev, creds, type) {
            loggerService.debug('[ml4kapi] 删除 IBM 凭证');

            var confirm = $mdDialog.confirm()
                .title('您确定吗？')
                .textContent('您确定要从 machinelearningforkids.co.uk 中移除这些凭证吗？')
                .ariaLabel('确认')
                .targetEvent(ev)
                .ok('是')
                .cancel('否');

            $mdDialog.show(confirm).then(
                function() {
                    usersService.deleteCredentials(vm.profile, creds)
                        .then(function () {
                            loggerService.debug('[ml4kapi] 已删除');

                            vm.credentials[type] = vm.credentials[type].filter(function (itm) {
                                return itm.id !== creds.id;
                            });
                            computeLimit(type);
                        })
                        .catch(function (err) {
                            loggerService.error('[ml4kapi] 删除失败', err);

                            displayAlert('errors', err.status, err.data);
                        });

                },
                function() {
                    // 取消。不做任何操作
                });
        };


        vm.addCredentials = function (ev, type) {
            loggerService.debug('[ml4kapi] 添加新的 IBM 凭证');

            $mdDialog.show({
                controller : function ($scope, $mdDialog) {
                    $scope.type = 'apikey';
                    $scope.credstype = '';

                    $scope.hide = function () {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function () {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function (resp) {
                        $mdDialog.hide(resp);
                    };
                },
                templateUrl : 'static/components/teacher_apikeys/newcreds' + type + '.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function(credentialsToAdd) {
                    credentialsToAdd.servicetype = type;
                    credentialsToAdd.isPlaceholder = true;

                    var placeholder = Date.now();
                    credentialsToAdd.uniq = placeholder;

                    vm.credentials[type].push(credentialsToAdd);

                    loggerService.debug('[ml4kapi] 存储 IBM 凭证');

                    usersService.addCredentials(credentialsToAdd, vm.profile.tenant)
                        .then(function (newcreds) {
                            loggerService.debug('[ml4kapi] 已存储');

                            vm.credentials[type] = vm.credentials[type].filter(function (c) {
                                return c.uniq !== placeholder;
                            });

                            vm.credentials[type].push(newcreds);
                            computeLimit(type);
                        })
                        .catch(function (err) {
                            loggerService.error('[ml4kapi] 存储失败', err);

                            var errId = displayAlert('errors', err.status, err.data);
                            scrollToNewItem('errors' + errId);

                            vm.credentials[type] = vm.credentials[type].filter(function (c) {
                                return c.uniq !== placeholder;
                            });
                        });
                },
                function() {
                    // 取消。不做任何操作
                }
            );
        };

        vm.modifyCredentials = function (ev, creds, type) {
            loggerService.debug('[ml4kapi] 修改 IBM 凭证');

            $mdDialog.show({
                controller : function ($scope, $mdDialog) {
                    $scope.credstype = creds.credstype;
                    $scope.currentcredstype = creds.credstype;

                    $scope.hide = function () {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function () {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function (resp) {
                        $mdDialog.hide(resp);
                    };
                },
                templateUrl : 'static/components/teacher_apikeys/modifycreds' + type + '.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function(modifyRequest) {
                    loggerService.debug('[ml4kapi] 更新 IBM 凭证');

                    usersService.modifyCredentials(creds, type, modifyRequest.credstype, vm.profile.tenant)
                        .then(function () {
                            loggerService.debug('[ml4kapi] 已更新');

                            creds.credstype = modifyRequest.credstype;
                            computeLimit(type);
                        })
                        .catch(function (err) {
                            loggerService.error('[ml4kapi] 更新失败', err);

                            var errId = displayAlert('errors', err.status, err.data);
                            scrollToNewItem('errors' + errId);
                        });
                },
                function() {
                    // 取消。不做任何操作
                }
            );
        };


        vm.explainLimit = function () {
            var alert = $mdDialog.alert()
                            .title('机器学习模型数量限制说明')
                            .textContent('当您班级中的学生点击"训练机器学习模型"按钮时，他们创建的模型将计入此限制。' +
                                         '如果超出此限制，他们将看到一个错误，提示班级已达到允许创建的最大模型数量。' +
                                         '有关如何避免此问题的建议，请参阅"帮助"页面')
                            .ok('确定');
            $mdDialog.show(alert);
        };


        function scrollToNewItem(itemId) {
            $timeout(function () {
                var newItem = document.getElementById(itemId);
                $document.duScrollToElementAnimated(angular.element(newItem));
            }, 0);
        }
    }
}());
