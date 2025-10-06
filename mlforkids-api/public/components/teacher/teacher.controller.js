(function () {

    angular
        .module('app')
        .controller('TeacherController', TeacherController);

    TeacherController.$inject = [
        'authService', 'usersService',
        '$mdDialog'
    ];

    function TeacherController(authService, usersService, $mdDialog) {

        var vm = this;
        vm.authService = authService;

        vm.busy = false;

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


        authService.getProfileDeferred()
            .then(function (profile) {
                vm.profile = profile;

                if (profile.role === 'supervisor') {
                    usersService.getClassPolicy(profile)
                        .then(function (policy) {
                            vm.policy = policy;

                            vm.policy.missingCredentials = false;
                            for (var i = 0; i < policy.supportedProjectTypes.length; i++) {
                                var projectType = policy.supportedProjectTypes[i];
                                if (projectType === 'text' && policy.maxTextModels === 0)
                                {
                                    vm.policy.missingCredentials = true;
                                }
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




        vm.deleteClass = function (ev) {
            var confirm = $mdDialog.confirm()
                            .title('您确定吗？')
                            .htmlContent('<div class="confirmdialogsmall">此操作无法撤销。' +
                                '这将删除您的账户，以及您所有学生的账户。' +
                                '如果您执行此操作，我将无法恢复您班级中的任何项目。</div>')
                            .targetEvent(ev)
                            .ok('是的，删除所有内容。')
                            .cancel('取消');
            $mdDialog.show(confirm)
                .then(
                    function () {
                        vm.busy = true;
                        usersService.deleteClass(vm.profile)
                            .then(function () {
                                authService.logout();
                            })
                            .catch(function (err) {
                                vm.busy = false;
                                displayAlert('errors', err.status, err);
                            });
                    },
                    function () { /* 已取消 */ }
                );
        }
    }
}());
