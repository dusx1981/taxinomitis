(function () {

    angular
        .module('app')
        .controller('TrainingController', TrainingController);

    TrainingController.$inject = [
        'authService',
        'projectsService', 'trainingService', 'modelService',
        'soundTrainingService',
        'utilService', 'csvService', 'downloadService', 'imageToolsService', 'webcamsService',
        'loggerService',
        '$stateParams',
        '$scope',
        '$mdDialog',
        '$state',
        '$timeout',
        '$q'
    ];

    function TrainingController(authService, projectsService, trainingService, modelService, soundTrainingService, utilService, csvService, downloadService, imageToolsService, webcamsService, loggerService, $stateParams, $scope, $mdDialog, $state, $timeout, $q) {

        var vm = this;
        vm.authService = authService;

        var placeholderId = 1;


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
            else {
                // 记录错误
                loggerService.error(errObj);
                if (status === 500 && Sentry && Sentry.captureException) {
                    Sentry.captureException({ error : errObj, errortype : typeof (errObj) });
                }
            }

            vm[type].push({
                alertid : alertId++,
                message : errObj.message || errObj.error || '未知错误',
                status : status
            });
        }
        vm.displayAlert = displayAlert;

        $scope.loadingtraining = true;

        $scope.crowdSourced = false;
        $scope.reviewing = $stateParams.review;

        $scope.projectId = $stateParams.projectId;
        $scope.userId = $stateParams.userId;
        $scope.training = {};

        var webcams;
        var currentWebcamIdx = 0;


        // 在执行任何其他操作之前检查是否已认证
        authService.getProfileDeferred()
            .then(function (profile) {
                vm.profile = profile;

                // 获取我们要训练的项目
                loggerService.debug('[ml4ktraining] 获取项目信息');
                return projectsService.getProject($scope.projectId, $scope.userId, profile.tenant);
            })
            .then(function (project) {
                loggerService.debug('[ml4ktraining] 项目', project);
                $scope.project = project;

                // 如果用户不拥有该项目（由教师使用"众包"模式共享给他们）
                //  那么我们需要隐藏一些控件
                $scope.crowdSourced = project.isCrowdSourced &&
                                      (vm.profile.user_id !== project.userid);

                // 对于非文本项目，我们需要获取更多内容...

                if (project.type === 'numbers') {
                    // 对于数字项目，我们需要字段来填充新值的下拉菜单
                    loggerService.debug('[ml4ktraining] 获取项目字段');
                    return projectsService.getFields($scope.project, $scope.userId, vm.profile.tenant)
                        .then(function (fields) {
                            $scope.project.fields = fields;
                            $scope.projectfieldnames = fields.map(function (field) {
                                return field.name;
                            });
                            loggerService.debug('[ml4ktraining] 字段名称', $scope.projectfieldnames);
                        });
                }
                else if (project.type === 'sounds') {
                    // 对于声音项目，如果页面中尚未加载 TensorFlow.js 库，我们需要下载它们
                    loggerService.debug('[ml4ktraining] 设置声音模型支持');
                    var loadSavedModel = false; // 仅使用声音支持来收集训练示例
                    return soundTrainingService.initSoundSupport(project.id, project.labels, loadSavedModel)
                        .then(function (outcome) {
                            $scope.soundModelInfo = soundTrainingService.getModelInfo();
                            if (outcome && outcome.warning) {
                                displayAlert('warnings', 500, outcome.warning);
                            }
                        });
                }
                else if (project.type === 'imgtfjs') {
                    // 对于图像项目，我们需要为网络摄像头和画布控件注入依赖项
                    loggerService.debug('[ml4ktraining] 获取图像项目依赖项');
                    return utilService.loadImageProjectSupport();
                }
            })
            .then(function () {
                // 现在我们应该拥有准备页面标题所需的一切
                refreshLabelsSummary();

                // 为项目准备空的训练数据桶
                for (var labelIdx in $scope.project.labels) {
                    var label = $scope.project.labels[labelIdx];
                    $scope.training[label] = [];
                }

                // 获取训练数据以填充数据桶
                loggerService.debug('[ml4ktraining] 获取训练数据');
                return trainingService.getTraining($scope.projectId, $scope.userId, vm.profile.tenant);
            })
            .then(function (training) {
                if ($scope.project.type === 'regression') {
                    $scope.training = training;
                    $scope.regressionmode = 'init';

                    $scope.$watch('project.columns', function (columns, previous) {
                        refreshLabelsSummary();

                        if (columns && !angular.equals(columns, previous)) {
                            projectsService.addMetadataToProject($scope.project, 'columns', columns)
                                .catch (function (err) {
                                    displayAlert('errors', 500, err);
                                });
                            modelService.deleteModel($scope.project.type, $scope.project.id)
                                .catch (function (err) {
                                    loggerService.error('[ml4ktraining] 删除模型失败', err);
                                });
                        }
                    }, true);
                }
                else {
                    // 所有训练数据项将在一个列表中返回
                    //  因此现在需要将它们分类到不同的数据桶中
                    for (var trainingitemIdx in training) {
                        var trainingitem = training[trainingitemIdx];

                        var label = trainingitem.label;

                        if (label in $scope.training === false) {
                            // 这不应该发生 - 这意味着我们获得了一些训练数据
                            //  但对应的标签项目未知
                            //
                            // 这意味着页面状态已过时（例如，标签是在页面首次加载后
                            //  从另一个页面实例创建的）这是一个极不可能的竞态条件，
                            //  但我们通过使用这个新标签创建一个新数据桶来避免可能的错误
                            $scope.training[label] = [];
                        }

                        $scope.training[label].push(trainingitem);

                        // 如果这是文本项目...
                        //          trainingitem 包含完整数据 - 无需其他操作
                        // 如果这是数字项目...
                        //          trainingitem 包含完整数据 - 无需其他操作
                        // 如果这是图像项目...
                        //          trainingitem 包含图像的 URL，但当我们将其放入 img src 属性时，
                        //              浏览器会自动为我们获取它，因此此处代码无需其他操作，
                        //              但在图像出现在 UI 之前会有另一个网络请求
                        // 如果这是声音项目...
                        //          trainingitem 包含声音频谱图的 URL，但我们需要
                        //              显式获取它（页面将显示加载图标直到我们获取到它）



                        if ($scope.project.type === 'sounds') {
                            // 这将修改 'trainingitem' 以添加 'audiodata' 属性
                            //  （但不会立即执行，因为它需要进行 XHR 请求来获取）
                            trainingService.getSoundData(trainingitem);
                        }
                    }
                }

                $scope.loadingtraining = false;
            })
            .catch(function (err) {
                loggerService.error('[ml4ktraining] 错误', err);
                displayAlert('errors', err.status, err.data ? err.data : err);
            });


        function refreshLabelsSummary () {
            var summary = '';
            if ($scope.project.labels.length > 0) {
                var labels = $scope.project.type === 'sounds' ?
                    $scope.project.labels.filter(function (label) {
                        return label !== '_background_noise_';
                    }) :
                    $scope.project.labels;

                summary = modelService.generateProjectSummary(labels, ' 或 ') || '';
            }
            else if ($scope.project.type === 'regression') {
                var projectColumns = $scope.project.columns || [];
                var columns = projectColumns
                    .filter(col => col.output)
                    .map(col => col.label);
                summary = modelService.generateProjectSummary(columns, ' 和 ') || '某物';
                var numInputs = projectColumns.length - columns.length;
                if (numInputs) {
                    $scope.columnsSummary = ' 来自 ' + numInputs + ' 个输入值';
                }
            }
            $scope.project.labelsSummary = summary;
        }


        function getNumberValues(obj) {
            var fields = $scope.projectfieldnames ? $scope.projectfieldnames : Object.keys(obj);
            return fields.map(function (key) {
                if (obj[key].includes('.')) {
                    return parseFloat(obj[key]);
                }
                else {
                    return parseInt(obj[key]);
                }
            });
        }

        vm.addTrainingData = function (ev, label) {
            loggerService.debug('[ml4ktraining] addTrainingData');
            $mdDialog.show({
                locals : {
                    label : label,
                    project : $scope.project
                },
                controller : function ($scope, locals) {
                    $scope.label = locals.label;
                    $scope.project = locals.project;
                    $scope.values = {};

                    $scope.hide = function() {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function() {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function(resp) {
                        $mdDialog.hide(resp);
                    };
                    $scope.submitOnEnter = function(event) {
                        var code = event.keyCode || event.which;
                        if (code === 13) {
                            event.preventDefault();
                            $scope.confirm($scope.example);
                        }
                    };

                    $scope.$watch('example', function (newval, oldval) {
                        if ($scope && $scope.example && newval !== oldval) {
                            $scope.example = newval.replace(/[\r\n\t]/g, ' ');
                        }
                    }, true);
                },
                templateUrl : 'static/components/training/trainingdata.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function (resp) {
                    if ($scope.project.type === 'imgtfjs') {
                        try {
                            // 对可能需要编码的任何 URL 字符进行编码
                            resp = new URL(resp).toString();
                        }
                        catch (err) {
                            loggerService.debug('[ml4ktraining] 无法转义 URL 字符，使用原始字符串', err);
                        }
                    }
                    vm.addConfirmedTrainingData(resp, label);
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };


        vm.addConfirmedTrainingData = function (resp, label) {
            loggerService.debug('[ml4ktraining] addConfirmedTrainingData');

            var data;
            var placeholder;

            var duplicate = false;

            var storeTrainingDataFn = trainingService.newTrainingData;

            if ($scope.project.type === 'text') {
                data = resp;

                var lc = data.toLowerCase();
                duplicate = $scope.training[label].some(function (existingitem) {
                    return existingitem.textdata.toLowerCase() === lc;
                });

                placeholder = {
                    id : 'placeholder_' + (placeholderId++),
                    label : label,
                    projectid : $scope.projectId,
                    textdata : data,
                    isPlaceholder : true
                };
            }
            else if ($scope.project.type === 'numbers') {
                data = getNumberValues(resp);

                placeholder = {
                    id : 'placeholder_' + (placeholderId++),
                    label : label,
                    projectid : $scope.projectId,
                    numberdata : data,
                    isPlaceholder : true
                };
            }
            else if ($scope.project.type === 'imgtfjs') {
                data = resp;

                duplicate = $scope.training[label].some(function (existingitem) {
                    return existingitem.imageurl === data;
                });

                placeholder = {
                    id : 'placeholder_' + (placeholderId++),
                    label : label,
                    projectid : $scope.projectId,
                    imageurl : data,
                    isPlaceholder : true
                };
            }
            else if ($scope.project.type === 'sounds') {
                // 将从对话框获取的 Float32Array
                //  转换为常规的 JavaScript 数组
                // （可以使用 Array.from(resp) 但 IE 不支持）
                data = Array.prototype.slice.call(resp);

                // 重复项极不可能，因此我们不会浪费时间检查

                placeholder = {
                    id : 'placeholder_' + (placeholderId++),
                    label : label,
                    projectid : $scope.projectId,
                    audiodata : data,
                    isPlaceholder : true
                };

                // 重要 - 我们使用不同的 API 上传声音
                storeTrainingDataFn = trainingService.uploadSound;
            }

            if (duplicate) {
                return displayAlert('errors', 400, {
                    message : '该数据已存在于您的训练数据中'
                });
            }

            $scope.training[label].push(placeholder);

            loggerService.debug('[ml4ktraining] 存储训练数据');
            storeTrainingDataFn($scope.projectId, $scope.userId, vm.profile.tenant, $scope.project.type, $scope.project.storage, data, label)
                .then(function (newitem) {
                    placeholder.isPlaceholder = false;
                    placeholder.id = newitem.id;

                    if ($scope.project.type === 'imgtfjs' && placeholder.imageurl)
                    {
                        if (utilService.isGoogleFilesUrl(placeholder.imageurl)) {
                            displayAlert('warnings', 400, { message :
                                'Google 通常会移除对 googleusercontent.com 和 lh3.google.com 上图像的访问权限，' +
                                '这可能会阻止您使用此图像训练模型' });
                        }
                    }

                    scrollToNewItem(newitem.id);
                })
                .catch(function (err) {
                    if (errorSuggestsProjectDeleted(err)) {
                        return $state.go('projects');
                    }

                    displayAlert('errors', err.status, err.data);

                    var idxToRemove = findTrainingIndex(label, placeholder.id);
                    if (idxToRemove !== -1) {
                        $scope.training[label].splice(idxToRemove, 1);
                    }
                });
        };



        function attemptRefresh() {
            try {
                $scope.$apply();
            }
            catch (refreshErr) {
                loggerService.debug('[ml4ktraining] 无法刷新', refreshErr);
            }
        }


        function errorSuggestsProjectDeleted(err) {
            return err &&
                   err.status === 404 &&
                   err.data &&
                   err.data.error === '未找到';
        }


        vm.onImageLoad = function (image) {
            loggerService.debug('[ml4ktraining] onImageLoad');
            loggerService.debug(image);
        };

        vm.onImageError = function (image) {
            image.loadingFailed = true;
            // displayAlert('errors', 400, {
            //     error : '图像 (' + image.imageurl + ') 在 ' + image.label + ' 数据桶中无法加载，并已用红色高亮显示。您应该删除它。'
            // });
        };


        vm.addLabel = function (ev) {
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
                templateUrl : 'static/components/training/newlabel.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function (newlabel) {
                    loggerService.debug('[ml4ktraining] 添加新标签', newlabel);
                    projectsService.addLabelToProject($scope.project, $scope.userId, vm.profile.tenant, newlabel)
                        .then(function (labels) {
                            $scope.project.labels = labels;
                            for (var i = 0; i < labels.length; i++) {
                                if (!$scope.training[labels[i]]){
                                    $scope.training[labels[i]] = [];
                                }
                            }

                            refreshLabelsSummary();

                            if ($scope.project.storage === 'local') {
                                attemptRefresh();
                            }
                        })
                        .catch(function (err) {
                            if (errorSuggestsProjectDeleted(err)) {
                                return $state.go('projects');
                            }

                            displayAlert('errors', err.status, err.data);
                        });
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };


        vm.deleteText = function (label, item, idx) {
            $scope.training[label].splice(idx, 1);
            trainingService.deleteTrainingData($scope.projectId, $scope.userId, vm.profile.tenant, item.id)
                .catch(function (err) {
                    displayAlert('errors', err.status, err.data);
                });
        };

        vm.deleteLabel = function (ev, label, idx) {
            var confirm = $mdDialog.confirm()
                .title('确定吗？')
                .textContent('您确定要删除 "' + label + '" 吗？（此操作无法撤销）')
                .ariaLabel('确认')
                .targetEvent(ev)
                .ok('是')
                .cancel('否');

            $mdDialog.show(confirm).then(
                function() {
                    delete $scope.training[label];
                    $scope.project.labels.splice(idx, 1);

                    refreshLabelsSummary();

                    projectsService.removeLabelFromProject($scope.project, $scope.userId, vm.profile.tenant, label)
                        .catch(function (err) {
                            displayAlert('errors', err.status, err.data);
                        });
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };





        vm.addImageFile = function (file, label, scrollto) {
            imageToolsService.getDataFromFile(file)
                .then(function (data) {
                    vm.addImageData(data, label, scrollto);
                });
        };


        vm.useWebcam = function (ev, label) {
            $mdDialog.show({
                locals : {
                    label : label,
                    project : $scope.project
                },
                controller : function ($scope, locals) {
                    $scope.label = locals.label;
                    $scope.project = locals.project;
                    $scope.values = {};
                    $scope.channel = {};
                    $scope.webcamerror = false;
                    $scope.webcamInitComplete = false;
                    $scope.multipleWebcams = false;

                    webcamsService.getDevices()
                        .then((devices) => {
                            webcams = devices;
                            $scope.channel.videoOptions = webcams[currentWebcamIdx];
                            $scope.multipleWebcams = webcams.length > 1;
                            loggerService.debug('[ml4ktraining] 网络摄像头配置', $scope.channel.videoOptions);
                        });

                    $scope.webcamCanvas = null;

                    $scope.hide = function() {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function() {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function() {
                        imageToolsService.getDataFromImageSource($scope.channel.video, 'image/jpeg')
                            .then(function (imagedata) {
                                $mdDialog.hide(imagedata);
                            });
                    };


                    $scope.onWebcamSuccess = function () {
                        $scope.$apply(function() {
                            $scope.webcamInitComplete = true;
                        });
                    };

                    function displayWebcamError(err) {
                        loggerService.debug('[ml4ktraining] 显示网络摄像头错误', err);

                        $scope.webcamerror = err;
                        if (err && err.message) {
                            if (err.name === 'NotAllowedError') {
                                $scope.webcamerrordetail = '不允许使用网络摄像头';
                                return;
                            }
                            else {
                                $scope.webcamerrordetail = err.message;
                            }
                        }

                        loggerService.error('[ml4ktraining] 意外的网络摄像头错误', err);
                    }

                    function changeWebcamDevice () {
                        loggerService.debug('[ml4ktraining] 更改网络摄像头设备');
                        $scope.$applyAsync(() => {
                            $scope.webcamInitComplete = false;
                            $scope.channel.videoOptions = webcams[currentWebcamIdx];
                            $scope.$broadcast('STOP_WEBCAM');
                            $scope.$broadcast('START_WEBCAM');
                            loggerService.debug('[ml4ktraining] 新网络摄像头', webcams[currentWebcamIdx]);
                        });
                    }

                    $scope.switchWebcam = function () {
                        loggerService.debug('[ml4ktraining] 切换网络摄像头');
                        if (webcams.length > 0) {
                            currentWebcamIdx += 1;
                            if (currentWebcamIdx >= webcams.length) {
                                currentWebcamIdx = 0;
                            }
                            changeWebcamDevice();
                        }
                    };

                    $scope.onWebcamError = function(err) {
                        loggerService.warn('[ml4ktraining] 网络摄像头错误', err);

                        if (webcams) {
                            // 使用网络摄像头失败 - 我们将不再尝试此摄像头
                            webcams.splice(currentWebcamIdx, 1);
                            $scope.multipleWebcams = webcams.length > 1;
                            currentWebcamIdx = 0;

                            if (webcams.length > 0) {
                                // 还有其他网络摄像头尚未尝试
                                return changeWebcamDevice();
                            }
                        }

                        // 没有其他网络摄像头可供尝试
                        //   因此我们将显示错误
                        $scope.webcamInitComplete = true;

                        try {
                            $scope.$apply(
                                function() {
                                    displayWebcamError(err);
                                }
                            );
                        }
                        catch (applyErr) {
                            $timeout(function () {
                                displayWebcamError(err);
                            }, 0, false);
                        }
                    };
                },
                templateUrl : 'static/components/training/webcam.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function (resp) {
                    vm.addImageData(resp, label, true);
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };


        vm.useCanvas = function (ev, label) {
            $mdDialog.show({
                locals : {
                    label : label,
                    project : $scope.project
                },
                controller : function ($scope, locals) {
                    $scope.label = locals.label;
                    $scope.project = locals.project;
                    $scope.values = {};

                    $scope.hide = function() {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function() {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function() {
                        imageToolsService.getDataFromImageSource($scope.canvas, 'image/jpeg')
                            .then(function (imagedata) {
                                $mdDialog.hide(imagedata);
                            });
                    };
                },
                templateUrl : 'static/components/training/canvas.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function (resp) {
                    vm.addImageData(resp, label, true);
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };


        vm.addImageData = function (imagedata, label, scrollto) {
            var placeholder = {
                id : 'placeholder_' + (placeholderId++),
                label : label,
                projectid: $scope.projectId,
                imageurl : URL.createObjectURL(imagedata),
                isPlaceholder : true
            };

            $scope.training[label].push(placeholder);

            loggerService.debug('[ml4ktraining] 添加图像数据');
            trainingService.uploadImage($scope.project, $scope.userId, vm.profile.tenant, imagedata, label)
                .then(function (newitem) {
                    placeholder.isPlaceholder = false;
                    placeholder.id = newitem.id;

                    if (scrollto) {
                       scrollToNewItem(newitem.id);
                    }

                    $timeout(function () {
                        URL.revokeObjectURL(placeholder.imageurl);
                    }, 10000);
                })
                .catch(function (err) {
                    displayAlert('errors', err.status, err.data);

                    var idxToRemove = findTrainingIndex(label, placeholder.id);
                    if (idxToRemove !== -1) {
                        $scope.training[label].splice(idxToRemove, 1);
                    }
                });
        };



        vm.useMicrophone = function (ev, label) {
            $mdDialog.show({
                locals : {
                    label : label,
                    project : $scope.project,
                    soundModelInfo : soundTrainingService.getModelInfo(),
                },
                controller : function ($scope, locals) {
                    $scope.label = locals.label;
                    $scope.project = locals.project;
                    $scope.soundModelInfo = locals.soundModelInfo;
                    $scope.values = {};

                    $scope.hide = function() {
                        $mdDialog.hide();
                    };
                    $scope.cancel = function() {
                        $mdDialog.cancel();
                    };
                    $scope.confirm = function(resp) {
                        $mdDialog.hide(resp);
                    };

                    $scope.recordSound = function(label) {
                        delete $scope.example;
                        $scope.recording = true;

                        $scope.recordingprogress = 0;
                        var progressInterval = setInterval(function () {
                            $scope.$apply(
                                function() {
                                    $scope.recordingprogress += 10;
                                });
                        }, 1000 / 10);

                        soundTrainingService.collectExample(label)
                            .then(function (spectogram) {
                                clearInterval(progressInterval);
                                $scope.$apply(
                                    function() {
                                        $scope.recordingprogress = 100;
                                        if (spectogram && spectogram.data && spectogram.data.length > 0) {
                                            $scope.example = spectogram.data;
                                        }
                                        $scope.recording = false;
                                    });
                            })
                            .catch(function (err) {
                                clearInterval(progressInterval);
                                $scope.$apply(
                                    function() {
                                        $scope.recording = false;
                                        displayAlert('errors', 500, err);
                                    });
                            });
                    };
                },
                templateUrl : 'static/components/training/trainingdata.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function (resp) {
                    vm.addConfirmedTrainingData(resp, label);
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };


        $scope.downloadTrainingData = function (ev, label) {
            loggerService.debug('[ml4ktraining] 将训练数据下载到文件');
            if ($scope.project.type === 'text') {
                downloadService.downloadFile(
                    $scope.training[label].map(i => i.textdata + '\n'),
                    'text/plain', label + '.txt');
            }
            else if ($scope.project.type === 'numbers') {
                const exported = $scope.training[label].map((values) => {
                    const item = {};
                    $scope.project.fields.forEach((field, idx) => {
                        if (field.type === 'multichoice') {
                            item[field.name] = field.choices[values.numberdata[idx]];
                        }
                        else {
                            item[field.name] = values.numberdata[idx];
                        }
                    });
                    return item;
                });
                csvService.exportFile(exported, $scope.projectfieldnames)
                    .then(function (csvstring) {
                        downloadService.downloadFile([ csvstring ], 'text/csv', label + '.csv');
                    })
                    .catch(function (err) {
                        displayAlert('errors', 500, err);
                    });
            }
            else if ($scope.project.type === 'regression') {
                csvService.exportFile($scope.training, $scope.project.columns.map(c => c.label))
                    .then(function (csvstring) {
                        downloadService.downloadFile([ csvstring ], 'text/csv', 'training-' + $scope.project.id + '.csv');
                    })
                    .catch(function (err) {
                        displayAlert('errors', 500, err);
                    });
            }
        };

        $scope.uploadTrainingData = function (ev, elem) {
            loggerService.debug('[ml4ktraining] 从文件上传训练数据');
            var files = ev.currentTarget.files;
            if (files && files.length > 0) {
                var file = ev.currentTarget.files[0];
                if ($scope.project.type === 'regression') {
                    csvService.parseFile(file)
                        .then(function (results) {
                            if ($scope.project.columns && $scope.project.columns.length > 0) {

                                // 预存在的列 - 检查它们是否匹配
                                if (!angular.equals(results.meta.fields, $scope.project.columns.map(c => c.label)))
                                {
                                    throw new Error('CSV 文件中的列与您在此项目中的列不匹配');
                                }
                            }
                            else {

                                // 没有预存在的列 - 使用 CSV 中的列
                                $scope.project.columns = results.meta.fields.map(function (columnName) {
                                    const column = {
                                        label: columnName,
                                        output: false
                                    };

                                    if (results.data.length > 0) {
                                        column.type = typeof results.data[0][columnName];
                                    }
                                    else {
                                        // TODO 其他类型？
                                        column.type = 'unknown';
                                    }

                                    return column;
                                });
                            }

                            $scope.$applyAsync(() => { $scope.loadingtraining = true; });
                            return trainingService.bulkAddTrainingData($scope.project, results.data);
                        })
                        .then(function (stored) {
                            $scope.training = $scope.training.concat(stored);
                            $scope.$applyAsync(() => { $scope.loadingtraining = false; });
                        })
                        .catch(function (err) {
                            $scope.$applyAsync(() => { $scope.loadingtraining = false; });
                            displayAlert('errors', 400, err);
                        });
                }
                else if ($scope.project.type === 'numbers') {
                    const label = elem.dataset.label;
                    csvService.parseFile(file)
                        .then(function (results) {
                            // 预存在的字段 - 检查它们是否匹配
                            if (!angular.equals(results.meta.fields, $scope.project.fields.map(c => c.name)))
                            {
                                throw new Error('CSV 文件中的列与您在此项目中的字段不匹配');
                            }
                            return trainingService.bulkAddTrainingData($scope.project, { label, numbers : results.data });
                        })
                        .then(function (stored) {
                            $scope.training[label] = $scope.training[label].concat(stored);
                        })
                        .catch(function (err) {
                            displayAlert('errors', 400, err);
                        });
                }
                else if ($scope.project.type === 'text') {
                    const label = elem.dataset.label;

                    const txtfilereader = new FileReader();
                    txtfilereader.readAsText(file);
                    txtfilereader.onload = function () {
                        trainingService.bulkAddTrainingData($scope.project,
                                    txtfilereader.result
                                        .split(/[\r\n]+/)
                                        .map(line => line.substring(0, 1024).trim())
                                        .filter(line => line.length > 0)
                                        .reduce((acc, cur) => acc.includes(cur) ? acc : [...acc, cur], [])
                                        .map(function (line) {
                                            return { label, textdata : line };
                                        }))
                            .then(function (newitems) {
                                $scope.training[label] = $scope.training[label].concat(newitems);
                                attemptRefresh();
                            })
                            .catch(function (err) {
                                displayAlert('errors', 500, err);
                            });
                    };
                    txtfilereader.onerror = function () {
                        displayAlert('errors', 500, txtfilereader.error);
                    };
                }
                else if ($scope.project.type === 'imgtfjs') {
                    const label = elem.dataset.label;
                    for (var i = 0; i < ev.currentTarget.files.length; i++) {
                        var lastfile = i === (ev.currentTarget.files.length - 1);
                        vm.addImageFile(ev.currentTarget.files[i], label, lastfile);
                    }
                }
            }
        };

        vm.addRegressionColumn = function (ev) {
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
                templateUrl : 'static/components/training/newcolumn.tmpl.html',
                targetEvent : ev,
                clickOutsideToClose : true
            })
            .then(
                function (newlabel) {
                    loggerService.debug('[ml4ktraining] 添加新列', newlabel);
                    if (!$scope.project.columns) {
                        $scope.project.columns = [];
                    }
                    $scope.project.columns.push({
                        label: newlabel,
                        output: false,
                        type : 'number'
                    });
                },
                function() {
                    // 已取消。不执行任何操作
                }
            );
        };

        vm.deleteAllRegression = function (ev) {
            // TODO 请求确认？
            $scope.training = [];
            trainingService.clearTrainingData($scope.project);
        };

        vm.deleteRegressionItem = function (item) {
            var idx = $scope.training.indexOf(item);
            if (idx > -1) {
                $scope.training.splice(idx, 1);
                trainingService.deleteTrainingData($scope.projectId, $scope.userId, vm.profile.tenant, item.id)
                    .catch(function (err) {
                        displayAlert('errors', err.status, err.data);
                    });
            }
        };

        vm.setRegressionMode = function (mode) {
            $scope.regressionmode = mode;
        };

        function scrollToNewItem(itemId, retried) {
            $scope.$applyAsync(function () {
                var newItem = document.getElementById(itemId.toString());
                if (newItem) {
                    var itemContainer = newItem.parentElement;
                    angular.element(itemContainer).duScrollToElementAnimated(angular.element(newItem));
                }
                else if (!retried) {
                    $timeout(function () {
                        scrollToNewItem(itemId, true);
                    }, 0);
                }
                else {
                    loggerService.error('[ml4ktraining] 无法滚动到新项目', itemId);
                }
            });
        }

        $scope.$on("$destroy", function () {
            loggerService.debug('[ml4ktraining] 处理页面更改');

            if ($scope.project && $scope.project.type === 'sounds'){
                soundTrainingService.reset();
            }
        });


        function findTrainingIndex(label, id) {
            var len = $scope.training[label].length;
            for (var i = 0; i < len; i++) {
                if ($scope.training[label][i].id === id) {
                    return i;
                }
            }
            return -1;
        }


        $scope.getController = function() {
            return vm;
        };
    }
}());