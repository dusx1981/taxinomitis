(function () {

    angular
        .module('app')
        .controller('TeacherProjectsController', TeacherProjectsController);

    TeacherProjectsController.$inject = [
        'authService',
        'projectsService', 'trainingService',
        '$mdDialog', '$scope', 'loggerService'
    ];

    function TeacherProjectsController(authService, projectsService, trainingService, $mdDialog, $scope, loggerService) {

        var vm = this;
        vm.authService = authService;

        $scope.submittingDeleteRequest = false;

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


        vm.orderBy = 'name';



        function refreshProjectsList(profile) {
            loggerService.debug('[ml4ksupervise] 正在刷新项目列表');

            projectsService.getClassProjects(profile)
                .then(function (projects) {
                    loggerService.debug('[ml4ksupervise] 已获取项目列表');

                    vm.projects = projects;

                    for (var i = 0; i < vm.projects.length; i++) {
                        var project = vm.projects[i];

                        if (project.labels.length > 0) {
                            var summary = '';
                            switch (project.labels.length) {
                                case 1:
                                    summary = project.labels[0];
                                    break;
                                case 2:
                                    summary = project.labels[0] + ' 或 ' + project.labels[1];
                                    break;
                                case 3:
                                    summary = project.labels[0] + '、' +
                                              project.labels[1] + ' 或 ' +
                                              project.labels[2];
                                    break;
                                default:
                                    summary = project.labels[0] + '、' +
                                              project.labels[1] + ' 或 ' +
                                              (project.labels.length - 2) + ' 其他类别';
                                    break;
                            }
                            project.labelsSummary = summary;
                        }
                    }
                })
                .catch(function (err) {
                    loggerService.error('[ml4ksupervise] 获取项目列表失败', err);

                    displayAlert('errors', err.status, err.data);
                });
        }



        function refreshClassifiersList(profile) {
            loggerService.debug('[ml4ksupervise] 正在刷新分类器列表');

            trainingService.getUnmanagedClassifiers(profile.tenant)
                .then(function (classifiers) {
                    loggerService.debug('[ml4ksupervise] 已获取分类器列表');

                    vm.classifiers = classifiers;
                })
                .catch(function (err) {
                    loggerService.debug('[ml4ksupervise] 获取分类器列表失败');

                    if (err && err.status && err.status === 403) {
                        // probably a managed tenant - so they're not allowed
                        //  to review unmanaged classifiers (this is sorted
                        //  for them)
                    }
                    else {
                        loggerService.error(err);
                    }
                });
        }





        authService.getProfileDeferred()
            .then(function (profile) {
                vm.profile = profile;

                if (profile.role === 'supervisor') {
                    refreshProjectsList(profile);
                    refreshClassifiersList(profile);
                }
            })
            .catch(function (err) {
                displayAlert('errors', err.status, err.data);
            });


        vm.deleteModel = function (ev, project) {
            loggerService.debug('[ml4ksupervise] 正在删除模型');

            var confirm = $mdDialog.confirm()
                .title('确定吗？')
                .textContent('您确定要删除项目 ' + project.name + ' 中' +
                             (project.owner ? project.owner.username + ' 的 ' : '') +
                             '机器学习模型吗？')
                .ariaLabel('确认')
                .targetEvent(ev)
                .ok('是')
                .cancel('否');

            $mdDialog.show(confirm).then(
                function() {
                    loggerService.debug('[ml4ksupervise] 正在提交模型删除请求');

                    project.hasModel = false;
                    trainingService.deleteModel(project, project.userid, project.classid, project.classifierId)
                        .then(function () {
                            loggerService.debug('[ml4ksupervise] 模型删除成功');
                        })
                        .catch(function (err) {
                            loggerService.error('[ml4ksupervise] 删除模型失败', err);

                            displayAlert('errors', err.status, err.data);
                        });
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };

        vm.deleteClassifier = function (ev, classifier) {
            loggerService.debug('[ml4ksupervise] 正在删除分类器');

            $scope.submittingDeleteRequest = true;

            var confirm = $mdDialog.confirm()
                .title('确定吗？')
                .textContent('您确定要删除 ' + classifier.name + ' 吗？')
                .ariaLabel('确认')
                .targetEvent(ev)
                .ok('是')
                .cancel('否');

            $mdDialog.show(confirm).then(
                function() {
                    loggerService.debug('[ml4ksupervise] 正在提交分类器删除请求');

                    trainingService.deleteBluemixClassifier(vm.profile.tenant, classifier.id, classifier.credentials.id, classifier.type)
                        .then(function () {
                            loggerService.debug('[ml4ksupervise] 分类器删除成功');

                            $scope.submittingDeleteRequest = false;
                            vm.classifiers[classifier.type] = vm.classifiers[classifier.type].filter(function (c) {
                                return c.id !== classifier.id;
                            });
                        })
                        .catch(function (err) {
                            loggerService.error('[ml4ksupervise] 删除分类器失败', err);

                            $scope.submittingDeleteRequest = false;
                            displayAlert('errors', err.status, err.data);
                        });
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };
    }
}());
