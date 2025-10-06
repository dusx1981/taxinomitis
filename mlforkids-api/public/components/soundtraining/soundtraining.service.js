(function () {

    angular
        .module('app')
        .service('soundTrainingService', soundTrainingService);

    soundTrainingService.$inject = [
        '$q', '$window', '$location',
        'trainingService', 'modelService',
        'utilService', 'loggerService',
    ];

    function soundTrainingService($q, $window, $location, trainingService, modelService, utilService, loggerService) {

        var transferRecognizer;
        var transferModelInfo;

        var usingRestoredModel = false;
        var mlprojectid;
        var mlprojectlabels;


        var modelStatus;

        function isUserMediaSupported() {
            var supported = $window.navigator &&
                            $window.navigator.mediaDevices &&
                            $window.navigator.mediaDevices.getUserMedia;
            loggerService.debug('[ml4ksound] 是否支持用户媒体 ' + supported);
            return supported;
        }


        // 检查是否允许访问麦克风的最简单方法
        // 就是尝试访问麦克风   ¯\_(ツ)_/¯
        function permissionsCheck() {
            loggerService.debug('[ml4ksound] 检查权限');
            return $window.navigator.mediaDevices.getUserMedia({ audio : true, video : false })
                .then(function (stream) {
                    loggerService.debug('[ml4ksound] 停止每个音频轨道');
                    stream.getTracks().forEach(function (track) {
                        track.stop();
                    });
                    loggerService.debug('[ml4ksound] 权限正常');
                })
                .catch(function (err) {
                    loggerService.error('[ml4ksound] 权限检查失败', err);

                    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
                        throw { status : 400, data : {
                            message : '抱歉！儿童机器学习未被允许使用您的麦克风'
                        }};
                    }
                    else if (err.name === 'NotFoundError' || err.name === 'TypeError') {
                        throw { status : 400, data : {
                            message : '抱歉！儿童机器学习找不到可用的麦克风'
                        }};
                    }
                    else if (err.name === 'NotReadableError') {
                        throw { status : 400, data : {
                            message : '抱歉！您的麦克风出现问题'
                        }};
                    }
                    else {
                        // 记录错误
                        loggerService.error('[ml4ksound] 意外的权限错误');
                        if (err && Sentry && Sentry.captureException) {
                            Sentry.captureException(err);
                        }

                        throw { status : 500, data : err };
                    }
                });
        }

        function loadTensorFlow() {
            loggerService.debug('[ml4ksound] 加载 tensorflow');

            if (!isUserMediaSupported()) {
                loggerService.error('[ml4ksound] 不支持用户媒体');

                if (utilService.isInternetExplorer()) {
                    loggerService.debug('[ml4ksound] 在 Internet Explorer 上运行');
                    throw ({
                        status : 400,
                        data : { message : '抱歉！Internet Explorer 不能用于声音项目' }
                    });
                }
                else {
                    loggerService.debug('[ml4ksound] 报告找不到麦克风');
                    throw ({
                        status : 400,
                        data : { message : '抱歉！儿童机器学习找不到可用的麦克风' }
                    });
                }
            }

            return permissionsCheck()
                .then(function () {
                    loggerService.debug('[ml4ksound] 加载 tf');
                    return utilService.loadTensorFlow();
                })
                .then(function () {
                    loggerService.debug('[ml4ksound] 加载 speech-commands');
                    return utilService.loadScript('/static/bower_components/tensorflow-models/speech-commands/speech-commands.min.js?v=2');
                })
                .then(function () {
                    loggerService.debug('[ml4ksound] 已加载 speech-commands', speechCommands.version);

                    loggerService.debug('[ml4ksound] 启用 tf 生产模式');
                    if (tf && tf.enableProdMode) {
                        tf.enableProdMode();
                        loggerService.debug('[ml4ksound] tfjs 版本', tf.version);
                    }
                })
                .catch(function (err) {
                    loggerService.error('[ml4ksound] 加载 tensorflow 失败', err);
                    throw err;
                });
        }

        function initSoundSupport(projectid, labels, loadModelIfAvailable) {
            loggerService.debug('[ml4ksound] 初始化声音模型支持', {
                projectid : projectid, labels : labels, load : loadModelIfAvailable
            });

            if (projectid && !mlprojectid) {
                // 保存值以便将来调用重用
                mlprojectid = projectid;
                mlprojectlabels = labels;
            }

            var baseRecognizer;
            return loadTensorFlow()
                .then(function () {
                    loggerService.debug('[ml4ksound] 已加载 tensorflow。加载基础模型');

                    var siteUrl = $location.protocol() + '://' + $location.host();
                    if ($location.port()) {
                        siteUrl = siteUrl + ':' + $location.port();
                    }

                    var vocab = null;
                    var modelJson = siteUrl + '/static/bower_components/tensorflow-models/speech-commands/model.json';
                    var metadataJson = siteUrl + '/static/bower_components/tensorflow-models/speech-commands/metadata.json';
                    baseRecognizer = speechCommands.create('BROWSER_FFT', vocab, modelJson, metadataJson);
                    return baseRecognizer.ensureModelLoaded();
                })
                .then(function () {
                    loggerService.debug('[ml4ksound] 创建迁移学习识别器');
                    transferRecognizer = baseRecognizer.createTransfer('project-' + projectid);

                    var modelInfo = transferRecognizer.modelInputShape();
                    loggerService.debug('[ml4ksound] 模型信息', modelInfo);

                    transferModelInfo = {
                        numFrames : modelInfo[1],
                        fftSize : modelInfo[2]
                    };

                    if (loadModelIfAvailable) {
                        return loadModel(mlprojectid, mlprojectlabels);
                    }
                })
                .then(function (loaded) {
                    const outcome = {};
                    if (loaded) {
                        outcome.loaded = loaded;
                    }
                    if (navigator.userAgent.toLowerCase().includes('firefox')) {
                        outcome.warning = {
                            message : 'Firefox 用户报告使用声音模型时出现问题，因此如果您遇到问题，请尝试使用其他浏览器'
                        };
                    }

                    return outcome;
                });
        }

        function collectExample(label) {
            return transferRecognizer.collectExample(label);
        }

        function getModelInfo() {
            return transferModelInfo;
        }

        function getModels() {
            loggerService.debug('[ml4ksound] 获取声音模型');
            return $q(function (resolve) {
                if (modelStatus) {
                    modelStatus.lastPollTime = new Date();
                    resolve([ modelStatus ]);
                }
                else {
                    resolve([]);
                }
            });
        }

        function prepareSoundService() {
            if (usingRestoredModel) {
                // 从 indexeddb 恢复的模型没有训练新模型所需的基础层
                // 所以我们需要从头开始
                loggerService.debug('[ml4ksound] 设置新的迁移学习模型');
                // 这里缺少参数，所以这将依赖于重用先前的值
                return initSoundSupport();
            }
            else {
                // 我们没有使用从 indexeddb 恢复的模型，所以我们应该
                // 已经具备训练新模型所需的一切
                return $q(function (resolve) {
                    resolve();
                });
            }
        }

        function getTrainingData(projectid, userid, tenantid) {
            loggerService.debug('[ml4ksound] 获取训练数据', projectid);
            return trainingService.getTraining(projectid, userid, tenantid)
                .then(function (traininginfo) {
                    return $q.all(traininginfo.map(trainingService.getSoundData));
                });
        }




        function newModel(projectid, userid, tenantid) {
            loggerService.debug('[ml4ksound] 创建新的 ML 模型');
            loggerService.debug('[ml4ksound] tf 后端', tf.getBackend());
            loggerService.debug('[ml4ksound] tf 精度', tf.ENV.getBool('WEBGL_RENDER_FLOAT32_ENABLED'));

            modelStatus = {
                classifierid : projectid,
                status : '训练中',
                progress : 0,
                updated : new Date()
            };

            loggerService.debug('[ml4ksound] 准备声音服务');
            return prepareSoundService()
                .then(function () {
                    loggerService.debug('[ml4ksound] 获取训练数据');
                    return getTrainingData(projectid, userid, tenantid);
                })
                .then(function (trainingdata) {
                    loggerService.debug('[ml4ksound] 已检索训练数据');

                    // 重置
                    transferRecognizer.dataset.clear();
                    transferRecognizer.dataset.label2Ids = {};
                    transferRecognizer.words = null;

                    // 添加训练数据
                    for (var i = 0; i < trainingdata.length; i++) {
                        var trainingdataitem = trainingdata[i];

                        transferRecognizer.dataset.addExample({
                            label : trainingdataitem.label,
                            spectrogram : {
                                frameSize : transferModelInfo.fftSize,
                                data : new Float32Array(trainingdataitem.audiodata)
                            }
                        });
                    }

                    // 重建词汇表
                    transferRecognizer.collateTransferWords();

                    return tf.nextFrame();
                })
                .then(function () {
                    loggerService.debug('[ml4ksound] 开始迁移学习');

                    transferRecognizer
                        .train({
                            epochs : 100,
                            callback: {
                                onEpochEnd: function (epoch) {
                                    if (modelStatus) {
                                        // 周期是从零开始的
                                        modelStatus.progress = epoch + 1;
                                    }
                                }
                            }
                        })
                        .then(function () {
                            if (modelStatus) {
                                modelStatus.status = '可用';
                                modelStatus.progress = 100;
                                usingRestoredModel = false;

                                return saveModel(projectid);
                            }
                        })
                        .catch(function (err) {
                            loggerService.error('[ml4ksound] 模型训练失败', err);

                            if (modelStatus) {
                                modelStatus.status = '失败';
                                modelStatus.updated = new Date();
                            }
                        });

                    loggerService.debug('[ml4ksound] 返回临时状态');
                    return modelStatus;
                })
                .catch(function (err) {
                    loggerService.error('[ml4ksound] 模型训练失败', err);

                    if (modelStatus) {
                        modelStatus.status = '失败';
                        modelStatus.updated = new Date();
                    }

                    return modelStatus;
                });
        }


        function startTest(callback) {
            loggerService.debug('[ml4ksound] 开始监听');
            var predictionOptions = {
                probabilityThreshold : 0.7
            };
            return transferRecognizer.listen(function (result) {
                var matches = [];

                var labels = transferRecognizer.wordLabels();
                if (!labels) {
                    loggerService.debug('[ml4ksound] 标签不可用');
                    return callback(matches);
                }

                if (labels.length !== result.scores.length) {
                    loggerService.error('[ml4ksound] 意外的结果数量',
                               labels.length,
                               result.scores.length);
                }

                for (var i = 0; i < Math.min(labels.length, result.scores.length); i++) {
                    matches.push({
                        class_name : labels[i],
                        confidence : result.scores[i] * 100
                    });
                }

                matches.sort(modelService.sortByConfidence);

                callback(matches);
            }, predictionOptions);
        }

        function stopTest() {
            loggerService.debug('[ml4ksound] 停止监听');
            try {
                return transferRecognizer.stopListening();
            }
            catch (err) {
                return $q.reject(err);
            }
        }




        var MODELTYPE = 'sounds';

        function deleteModel(projectid) {
            modelStatus = null;
            return modelService.deleteModel(MODELTYPE, projectid);
        }

        function saveModel(projectid) {
            return modelService.saveModel(MODELTYPE, projectid, transferRecognizer);
        }

        function loadModel(projectid, labels) {
            loggerService.debug('[ml4ksound] 从存储加载模型', projectid);
            return modelService.loadModel(MODELTYPE, projectid, transferRecognizer)
                .then(function (resp) {
                    if (resp) {
                        transferRecognizer.words = Array.from(labels).sort();
                        modelStatus = {
                            classifierid : projectid,
                            status : '可用',
                            progress : 100,
                            updated : resp.timestamp
                        };
                        usingRestoredModel = true;

                        return modelStatus;
                    }
                });
        }

        function reset() {
            loggerService.debug('[ml4ksound] 重置');
            try {
                if (transferRecognizer) {
                    tf.dispose(transferRecognizer);
                }
            }
            catch (err) {
                loggerService.debug('[ml4ksound] 处置转移模型失败', err);
            }
        }


        return {
            initSoundSupport : initSoundSupport,
            getModelInfo : getModelInfo,
            collectExample : collectExample,
            newModel : newModel,
            deleteModel : deleteModel,
            getModels : getModels,
            startTest : startTest,
            stopTest : stopTest,
            reset : reset
        };
    }
})();