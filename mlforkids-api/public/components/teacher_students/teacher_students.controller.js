(function () {

    angular
        .module('app')
        .controller('TeacherStudentsController', TeacherStudentsController);

    TeacherStudentsController.$inject = [
        'authService',
        'usersService',
        '$scope', '$mdDialog', '$document', '$timeout', 'loggerService'
    ];

    function TeacherStudentsController(authService, usersService, $scope, $mdDialog, $document, $timeout, loggerService) {

        var vm = this;
        vm.authService = authService;

        vm.allStudentPasswordsReset = false;

        var placeholderId = 1;

        $scope.MAX_PER_GROUP = 40;

        vm.groupedStudents = {};

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

        function noop() {}
        function assumeok() { return true; }
        function handleerr(err) {
            var errId = displayAlert('errors', err.status, err.data);
            scrollToNewItem('errors' + errId);
        }



        $scope.busy = true;
        authService.getProfileDeferred()
            .then(function (profile) {
                vm.profile = profile;

                if (profile.role === 'supervisor') {
                    if (!profile.groups) {
                        profile.groups = [];
                    }

                    usersService.getClassPolicy(profile)
                        .then(function (policy) {
                            vm.policy = policy;
                            $scope.busy = false;
                        })
                        .catch(handleerr);
                }
            })
            .catch(handleerr);





        // ---------------------------------------------------------------
        // 页面逻辑的通用包装器，确保全局忙碌指示器始终正确设置
        // ---------------------------------------------------------------

        function performPageOperation(opname, prechecks, opfunction, onsuccess, onfail, confirmation) {
            loggerService.debug('[ml4kuser] 开始 ' + opname);

            $scope.busy = true;

            if (!prechecks()) {
                $scope.busy = false;
                return;
            }

            var runOp = function () {
                opfunction()
                    .then(onsuccess)
                    .then(function () {
                        loggerService.debug('[ml4kuser] 完成 ' + opname);

                        $scope.busy = false;
                    })
                    .catch(function (err) {
                        loggerService.error('[ml4kuser] 执行操作失败', opname, err);

                        onfail(err);

                        var errId = displayAlert('errors', err.status, err.data);
                        scrollToNewItem('errors' + errId);

                        $scope.busy = false;
                    });
            };

            if (confirmation) {
                requestConfirmationBeforeFunction(confirmation, runOp, function () {
                    $scope.busy = false;
                });
            }
            else {
                runOp();
            }
        }

        // ---------------------------------------------------------------
        // ----- 数据/API 函数 --------------------------------------------
        // ---------------------------------------------------------------


        // 检索要在页面中显示的学生列表
        function fetchAndDisplayStudents(profile, groupname) {
            var operation = '获取组 ' + groupname + ' 中的学生';
            var opFunction = function () {
                return usersService.getStudentList(profile, groupname);
            };
            var onSuccess = function (students) {
                vm.groupedStudents[groupname] = students;
            };
            performPageOperation(operation, assumeok, opFunction, onSuccess, noop);
        }


        // 检索未分组学生以在最终列表中显示
        $scope.fetchAndDisplayUngroupedStudents = function () {
            var operation = '获取未分组学生';

            var prechecks = function () {
                $scope.ungroupedStudentsExpanded = !$scope.ungroupedStudentsExpanded;
                return !vm.ungroupedStudents;
            };

            var opFunction = function () {
                return usersService.getStudentList(vm.profile, '');
            };

            var onSuccess = function (students) {
                vm.ungroupedStudents = students;
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, noop);
        };


        // 将选定的学生从一个组移动到另一个组
        $scope.moveStudentsIntoGroup = function(fromgroup, togroup) {
            var operation = '将学生从 ' + fromgroup + ' 移动到 ' + togroup;

            var prechecks = function () {
                if (!selections[fromgroup]) {
                    selections[fromgroup] = [];
                }
                return true;
            };

            var movingStudents = getAndMarkSelectedStudents(fromgroup);

            var opFunction = function () {
                return usersService.addStudentsToGroup(selections[fromgroup], vm.profile.tenant, togroup);
            };

            var onSuccess = function () {
                if (vm.groupedStudents[togroup]) {
                    for (var i = 0; i < movingStudents.length; i++) {
                        var movingStudent = movingStudents[i];
                        movingStudent.isPlaceholder = false;
                        vm.groupedStudents[togroup].push(movingStudent);
                    }
                }
                if (fromgroup === 'ungrouped') {
                    vm.ungroupedStudents = vm.ungroupedStudents.filter(function (student) {
                        return selections[fromgroup].indexOf(student.id) === -1;
                    });
                }
                else {
                    vm.groupedStudents[fromgroup] = vm.groupedStudents[fromgroup].filter(function (student) {
                        return selections[fromgroup].indexOf(student.id) === -1;
                    });
                }
                selections[fromgroup] = [];
            };

            var onFailure = function () {
                for (var i = 0; i < movingStudents.length; i++) {
                    var movingStudent = movingStudents[i];
                    movingStudent.isPlaceholder = false;
                }
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure);
        };


        // 将选定的学生从组中移动到未分组列表
        $scope.removeStudentsFromGroup = function(group) {
            var operation = '从组 ' + group + ' 中移除学生';

            var prechecks = function () {
                if (!selections[group]) {
                    selections[group] = [];
                }
                return true;
            };

            var movingStudents = getAndMarkSelectedStudents(group);

            var opFunction = function () {
                return usersService.removeStudentsFromGroup(selections[group], vm.profile.tenant);
            };

            var onSuccess = function () {
                if (vm.ungroupedStudents) {
                    for (var i = 0; i < movingStudents.length; i++) {
                        var movingStudent = movingStudents[i];
                        movingStudent.isPlaceholder = false;
                        vm.ungroupedStudents.push(movingStudent);
                    }
                }
                vm.groupedStudents[group] = vm.groupedStudents[group].filter(function (student) {
                    return selections[group].indexOf(student.id) === -1;
                });
                selections[group] = [];
            };

            var onFailure = function () {
                for (var i = 0; i < movingStudents.length; i++) {
                    var movingStudent = movingStudents[i];
                    movingStudent.isPlaceholder = false;
                }
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure);
        };


        // 删除选定的学生（首先显示提示）
        vm.deleteUsers = function (ev, groupname) {
            var operation = '从 ' + groupname + ' 删除选定的学生';

            var prechecks = function () {
                if (!vm.groupedStudents[groupname] || !selections[groupname]) {
                    return false;
                }
                return selections[groupname].length > 0 &&
                       selections[groupname].length <= $scope.MAX_PER_GROUP;
            };

            var studentsToDelete = getAndMarkSelectedStudents(groupname);

            var opFunction = function () {
                return usersService.deleteStudents(studentsToDelete, vm.profile.tenant);
            };

            var onSuccess = function (confirmation) {
                var deletedUserIds = confirmation.deleted.map(function (c) {
                    return c.id;
                });

                vm.groupedStudents[groupname] = vm.groupedStudents[groupname].filter(function (student) {
                    if (deletedUserIds.indexOf(student.id) > -1) {
                        // 学生已被删除
                        return false;
                    }
                    else {
                        // 学生无法删除
                        student.isPlaceholder = false;
                        return true;
                    }
                });
                selections[groupname] = [];

                if (studentsToDelete.length !== deletedUserIds.length) {
                    var errId = displayAlert('warnings', 400, { message : '无法删除所有选定的学生' });
                    scrollToNewItem('warnings' + errId);
                }
            };

            var onFailure = function () {
                studentsToDelete.forEach(function (student) {
                    student.isPlaceholder = false;
                });
            };

            var confirmation = {
                message : '您确定要删除这些学生及其所有工作吗？（此操作无法撤销）',
                event : ev
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure, confirmation);
        };


        // 删除单个学生（首先显示提示）
        vm.deleteUser = function (ev, groupname, student) {
            var operation = '删除学生 ' + student.username + ' ' + student.id;

            var prechecks = function () {
                student.isPlaceholder = true;
                return true;
            };

            var opFunction = function () {
                return usersService.deleteStudent(student, vm.profile.tenant);
            };

            var onSuccess = function () {
                if (groupname === 'ungrouped') {
                    vm.ungroupedStudents = vm.ungroupedStudents.filter(function (itm) {
                        return itm.username !== student.username;
                    });
                }
                else if (vm.groupedStudents[groupname]) {
                    vm.groupedStudents[groupname] = vm.groupedStudents[groupname].filter(function (itm) {
                        return itm.username !== student.username;
                    });
                }
            };

            var onFailure = function () {
                student.isPlaceholder = false;
            };

            var confirmation = {
                message : '您确定要删除 ' + student.username + ' 及其所有工作吗？（此操作无法撤销）',
                event : ev
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure, confirmation);
        };


        // 创建新的学生组
        $scope.createStudentGroup = function (ev) {
            loggerService.debug('[ml4kuser] 请求创建学生组的详细信息');

            $mdDialog.show({
                controller : function ($scope, $mdDialog) {
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
                templateUrl : 'static/components/teacher_students/newgroup.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function(groupname) {
                    var operation = '创建学生组 ' + groupname;

                    var prechecks = function () {
                        return groupname &&
                               groupname !== 'ALL' &&
                               groupname !== 'ungrouped' &&
                               vm.profile.groups.indexOf(groupname) === -1;
                    };

                    var opFunction = function () {
                        return usersService.createClassGroup(vm.profile, groupname);
                    };

                    var onSuccess = function () {
                        vm.profile.groups.push(groupname);
                        authService.storeProfile(vm.profile);
                    };

                    performPageOperation(operation, prechecks, opFunction, onSuccess, noop);

                }, noop);
        };


        // 删除学生组（必须为空）
        $scope.deleteStudentGroup = function (ev, groupname) {
            var operation = '删除学生组 ' + groupname;

            var prechecks = function () {
                return vm.groupedStudents[groupname] &&
                       vm.groupedStudents[groupname].length === 0;
            };

            var opFunction = function () {
                return usersService.deleteClassGroup(vm.profile, groupname);
            };

            var onSuccess = function () {
                vm.profile.groups = vm.profile.groups.filter(function (g) {
                    return g !== groupname;
                });
                authService.storeProfile(vm.profile);
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, noop);
        };


        // 重置单个学生的密码
        vm.resetUserPassword = function (ev, student) {
            var operation = '重置学生密码 ' + student.id + ' ' + student.username;

            var prechecks = function () {
                student.isPlaceholder = true;
                return true;
            };

            var opFunction = function () {
                return usersService.resetStudentPassword(student, vm.profile.tenant);
            };

            var onSuccess = function (updatedUser) {
                student.isPlaceholder = false;
                displayPassword(ev, updatedUser);
            };

            var onFailure = function () {
                student.isPlaceholder = false;
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure);
        };


        // 重置多个学生的密码
        vm.resetUsersPassword = function (ev, groupname) {
            var operation = '重置 ' + groupname + ' 中选定学生的密码';

            var prechecks = function () {
                return vm.groupedStudents[groupname] && selections[groupname] && selections[groupname].length > 0;
            };

            vm.allStudentPasswordsReset = true;
            var studentsToReset = getAndMarkSelectedStudents(groupname);

            var opFunction = function () {
                return usersService.resetStudentsPassword(studentsToReset, vm.profile.tenant);
            };

            var onSuccess = function (resp) {
                studentsToReset.forEach(function (student) {
                    student.isPlaceholder = false;
                });
                displayPassword(ev, {
                    username : '选定的学生',
                    password : resp.password
                }, studentsToReset.length > 30);
            };

            var onFailure = function () {
                studentsToReset.forEach(function (student) {
                    student.isPlaceholder = false;
                });
                vm.allStudentPasswordsReset = false;
            };

            var confirmation = {
                message : '您确定要重置选定学生的密码吗？',
                event : ev
            };

            performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure, confirmation);
        };


        // 创建单个用户
        vm.createUser = function (ev, group) {
            loggerService.debug('[ml4kuser] 请求在组 ' + group + ' 中创建单个学生的详细信息');

            if (!vm.groupedStudents[group] || vm.groupedStudents[group].length >= $scope.MAX_PER_GROUP) {
                return;
            }

            $mdDialog.show({
                controller : function ($scope, $mdDialog) {
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
                templateUrl : 'static/components/teacher_students/newstudent.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function(username) {
                    var operation = '创建学生 ' + username;

                    var newUserObj = {
                        id : placeholderId++,
                        username : username,
                        group : group,
                        isPlaceholder : true
                    };
                    vm.groupedStudents[group].push(newUserObj);

                    var opFunction = function () {
                        return usersService.createStudent(newUserObj, vm.profile.tenant);
                    };

                    var onSuccess = function (newUser) {
                        newUserObj.id = newUser.id;
                        newUserObj.isPlaceholder = false;

                        displayPassword(ev, newUser);
                    };

                    var onFailure = function () {
                        vm.groupedStudents[group] = vm.groupedStudents[group].filter(function (student) {
                            return student.id !== newUserObj.id;
                        });
                    };

                    performPageOperation(operation, assumeok, opFunction, onSuccess, onFailure);

                }, noop);
        };


        // 创建多个用户
        vm.createMultipleUsers = function (ev, group) {
            loggerService.debug('[ml4kuser] 请求创建多个学生的详细信息');

            var userslimit = Math.min($scope.MAX_PER_GROUP, vm.policy.maxUsers);
            var remaining = userslimit - vm.groupedStudents[group].length;

            $mdDialog.show({
                controller : function ($scope, $mdDialog) {
                    $scope.remaining = remaining;
                    $scope.userslimit = userslimit;

                    $scope.hide = function () {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function () {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function (prefix, number, password) {
                        $mdDialog.hide({
                            prefix : prefix,
                            number : number,
                            password : password
                        });
                    };
                    $scope.refreshPassword = function () {
                        $scope.password = '...';
                        usersService.getGeneratedPassword(vm.profile.tenant)
                            .then(function (resp) {
                                $scope.password = resp.password;
                            })
                            .catch(function (err) {
                                loggerService.error('[ml4kuser] 生成密码失败', err);
                            });
                    };

                    $scope.refreshPassword();
                },
                templateUrl : 'static/components/teacher_students/newstudents.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function(dialogResp) {
                    var operation = '创建多个学生';

                    var prechecks = function () {
                        if (vm.groupedStudents[group] && dialogResp.number && dialogResp.number < $scope.MAX_PER_GROUP) {
                            for (var i = 1; i <= dialogResp.number; i++) {
                                var newUserObj = {
                                    id : placeholderId++,
                                    username : dialogResp.prefix + i,
                                    isPlaceholder : true,
                                    group : group
                                };
                                vm.groupedStudents[group].push(newUserObj);
                            }
                            return true;
                        }
                        else {
                            return false;
                        }
                    };

                    var opFunction = function () {
                        return usersService.createStudents(vm.profile.tenant, dialogResp.prefix, dialogResp.number, dialogResp.password, group);
                    };

                    var onSuccess = function (apiResp) {
                        vm.groupedStudents[group] = vm.groupedStudents[group].filter(function (student) {
                            return !student.isPlaceholder;
                        });

                        if (apiResp && apiResp.successes) {
                            for (var i = 0; i < apiResp.successes.length; i++) {
                                vm.groupedStudents[group].push(apiResp.successes[i]);
                            }
                        }

                        displayCreateFailures(ev, apiResp, dialogResp.password);
                    };

                    var onFailure = function () {
                        vm.groupedStudents[group] = vm.groupedStudents[group].filter(function (student) {
                            return !student.isPlaceholder;
                        });
                    };

                    performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure);

                }, noop);
        };

        vm.importMultipleUsers = function (ev, group) {
            loggerService.debug('[ml4kuser] 请求导入学生的详细信息');

            var userslimit = Math.min($scope.MAX_PER_GROUP, vm.policy.maxUsers);
            var remaining = userslimit - vm.groupedStudents[group].length;

            $mdDialog.show({
                controller : function ($scope, $mdDialog) {
                    $scope.remaining = remaining;
                    $scope.userslimit = userslimit;
                    $scope.userstoimport = [];

                    $scope.hide = function () {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function () {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function (usernames, password) {
                        $mdDialog.hide({ usernames, password });
                    };
                    $scope.refreshPassword = function () {
                        $scope.password = '...';
                        usersService.getGeneratedPassword(vm.profile.tenant)
                            .then(function (resp) {
                                $scope.password = resp.password;
                            })
                            .catch(function (err) {
                                loggerService.error('[ml4kuser] 生成密码失败', err);
                            });
                    };
                    $scope.getUsers = function (ev) {
                        // const group = elem.dataset.group;
                        var files = ev.currentTarget.files;
                        if (files && files.length > 0) {
                            var file = ev.currentTarget.files[0];

                            const txtfilereader = new FileReader();
                            txtfilereader.readAsText(file);
                            txtfilereader.onload = function () {
                                const NEWLINES = /[\r\n]+/;
                                const INVALID_USERNAME_CHARS = /[^\w.\-_]/g;
                                const usernames = txtfilereader.result
                                                    .split(NEWLINES)
                                                    .map(line => line.trim().substring(0, 15).trim())
                                                    .filter(line => line.length > 2)
                                                    .map(line => line.replaceAll(INVALID_USERNAME_CHARS, ''))
                                                    .reduce((acc, cur) => acc.includes(cur) ? acc : [...acc, cur], []);
                                $scope.$applyAsync(() => {
                                    $scope.userstoimport = usernames.slice(0, remaining);
                                });
                            };
                            txtfilereader.onerror = function () {
                                displayAlert('errors', 500, txtfilereader.error);
                            };
                        }
                    };

                    $scope.refreshPassword();
                },
                templateUrl : 'static/components/teacher_students/importstudents.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function(dialogResp) {
                    var operation = '导入学生';

                    var prechecks = function () {
                        if (vm.groupedStudents[group]) {
                            for (const username of dialogResp.usernames) {
                                var newUserObj = {
                                    id : placeholderId++,
                                    username,
                                    isPlaceholder : true,
                                    group : group
                                };
                                vm.groupedStudents[group].push(newUserObj);
                            }
                            return true;
                        }
                        else {
                            return false;
                        }
                    };

                    var opFunction = function () {
                        return usersService.importStudents(vm.profile.tenant, dialogResp.usernames, dialogResp.password, group);
                    };

                    var onSuccess = function (apiResp) {
                        vm.groupedStudents[group] = vm.groupedStudents[group].filter(function (student) {
                            return !student.isPlaceholder;
                        });

                        if (apiResp && apiResp.successes) {
                            for (var i = 0; i < apiResp.successes.length; i++) {
                                vm.groupedStudents[group].push(apiResp.successes[i]);
                            }
                        }

                        displayCreateFailures(ev, apiResp, dialogResp.password);
                    };

                    var onFailure = function () {
                        vm.groupedStudents[group] = vm.groupedStudents[group].filter(function (student) {
                            return !student.isPlaceholder;
                        });
                    };

                    performPageOperation(operation, prechecks, opFunction, onSuccess, onFailure);

                }, noop);
        };


        // ---------------------------------------------------------------
        // ----- 页面交互功能 ---------------------------------------------
        // ---------------------------------------------------------------


        // ---------------------------------------------------------------
        // 处理可折叠的学生列表
        // ---------------------------------------------------------------

        var expandedpanels = [];
        $scope.collapsePanel = function (group) {
            var idx = expandedpanels.indexOf(group);
            if (idx > -1) {
                expandedpanels.splice(idx, 1);
            }
            else {
                expandedpanels.push(group);

                if (!vm.groupedStudents[group]) {
                    fetchAndDisplayStudents(vm.profile, group);
                }
            }
        };
        $scope.isPanelCollapsed = function (group) {
            return expandedpanels.indexOf(group) > -1;
        };

        $scope.ungroupedStudentsExpanded = false;

        // ---------------------------------------------------------------
        // 处理选择复选框
        // ---------------------------------------------------------------

        var selections = {};
        $scope.updateStudentSelection = function (group, studentid) {
            if (!selections[group]) {
                selections[group] = [];
            }
            var idx = selections[group].indexOf(studentid);
            if (idx > -1) {
                selections[group].splice(idx, 1);
            }
            else if (selections[group].length < $scope.MAX_PER_GROUP) {
                selections[group].push(studentid);
            }
        };
        $scope.selectAllStudents = function (group) {
            if ($scope.areAllStudentsSelected(group)) {
                selections[group] = [];
            }
            else {
                if (group === 'ungrouped') {
                    selections[group] = vm.ungroupedStudents.map(function (student) {
                        return student.id;
                    });
                }
                else {
                    selections[group] = vm.groupedStudents[group].map(function (student) {
                        return student.id;
                    });
                }
            }
        };
        $scope.isStudentSelected = function (group, studentid) {
            if (!selections[group]) {
                selections[group] = [];
            }
            return selections[group].indexOf(studentid) > -1;
        };
        $scope.areStudentsSelected = function (group) {
            return selections[group] && selections[group].length > 0;
        };
        $scope.areAllStudentsSelected = function (group) {
            if (group === 'ungrouped') {
                return selections[group] &&
                       vm.ungroupedStudents &&
                       selections[group].length === vm.ungroupedStudents.length;
            }
            else {
                return selections[group] &&
                       vm.groupedStudents[group] &&
                       selections[group].length === vm.groupedStudents[group].length;
            }
        };

        function getAndMarkSelectedStudents(groupname) {
            var selectedStudentObjs = [];
            if (groupname === 'ungrouped') {
                selectedStudentObjs = vm.ungroupedStudents.filter(function (student) {
                    var shouldMove = $scope.isStudentSelected(groupname, student.id);
                    if (shouldMove) {
                        student.isPlaceholder = true;
                    }
                    return shouldMove;
                });
            }
            else {
                selectedStudentObjs = vm.groupedStudents[groupname].filter(function (student) {
                    var shouldMove = $scope.isStudentSelected(groupname, student.id);
                    if (shouldMove) {
                        student.isPlaceholder = true;
                    }
                    return shouldMove;
                });
            }
            return selectedStudentObjs;
        }

        // ---------------------------------------------------------------
        // 请求用户确认
        // ---------------------------------------------------------------

        // 在运行函数前显示确认对话框
        function requestConfirmationBeforeFunction (confirmationReq, ifConfirmed, ifCancelled) {
            var confirm = $mdDialog.confirm()
                .title('确定吗？')
                .textContent(confirmationReq.message)
                .ariaLabel('确认')
                .targetEvent(confirmationReq.event)
                .ok('是')
                .cancel('否');

            $mdDialog.show(confirm).then(ifConfirmed, ifCancelled);
        }

        // 显示生成的密码
        function displayPassword(ev, student, showWarning) {
            $mdDialog.show(
                $mdDialog.alert()
                    .clickOutsideToClose(true)
                    .title(student.username)
                    .htmlContent(
                        '<div>密码: <span class="passworddisplaydialog">' + student.password + '</span></div>' +
                        (showWarning ? '<div><strong>注意：</strong>这可能需要几分钟才能生效。请耐心等待。' : ''))
                    .ariaLabel('确认学生密码')
                    .ok('确定')
                    .targetEvent(ev)
                );
        }


        function displayCreateFailures (ev, resp, password) {
            if (resp && resp.successes && resp.failures && resp.duplicates) {

                if (resp.failures.length > 0 || resp.duplicates.length > 0)
                {
                    var title = resp.failures.length > 0 ?
                                    '出错了！' :
                                    '用户名已被使用';

                    var message = '';

                    if (resp.failures.length > 0) {
                        message = '<div>抱歉。尝试创建以下用户时发生意外错误：<br/>' +
                                    '<code>' + resp.failures.join(', ') + '</code>' +
                                '</div>';
                    }
                    if (resp.duplicates.length > 0) {
                        message = '<div>以下学生账户无法创建，因为已存在具有这些用户名的用户：<br/>' +
                                    '<code>' + resp.duplicates.join(', ') + '</code>' +
                                '</div>';
                    }

                    displayCreateErrorMessage(ev, title, '<div style="padding: 1em">' + message + '</div>');
                }
                else if (resp.successes.length > 0) {
                    displayPassword(ev, {
                        username : '新学生已创建：',
                        password : password
                    }, false);
                }
            }
            else {
                var errId = displayAlert('errors', 500, { error : '意外的响应' });
                scrollToNewItem('errors' + errId);
            }
        }

        function displayCreateErrorMessage(ev, title, contents) {
            $mdDialog.show(
                $mdDialog.alert()
                    .clickOutsideToClose(true)
                    .title(title)
                    .htmlContent(contents)
                    .ok('确定')
                    .targetEvent(ev)
                );
        }

        function scrollToNewItem(itemId) {
            $timeout(function () {
                var newItem = document.getElementById(itemId);
                $document.duScrollToElementAnimated(angular.element(newItem));
            }, 0);
        }
    }
}());
