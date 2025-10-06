(function () {

    angular
        .module('app')
        .controller('ResetStorageController', ResetStorageController);

    ResetStorageController.$inject = [
        '$scope', '$timeout', 'storageService'
    ];

    function ResetStorageController($scope, $timeout, storageService) {
        $scope.debugoutput = { text : "调试输出\n" };

        function debug (str) {
            console.log(str);
            $scope.$applyAsync(() => {
                $scope.debugoutput.text += (Date.now().toString() + " : " + str + "\n");
            });
        }
        function divider (title) {
            debug('-------------------------------------------------------');
            debug(title);
            debug('-------------------------------------------------------');
        }
        function versionChangePrompt () {
            debug('此更改需要您刷新所有打开儿童机器学习网站的标签页或页面（包括当前页面）');
        }
        function handleErr (err) {
            debug(err);
            debug(err.stack);
        }

        function debugDatabase(db) {
            debug('数据库名称:    ' + db.name);
            debug('数据库版本: ' + db.version);

            const DBOpenRequest = window.indexedDB.open(db.name, db.version);
            DBOpenRequest.onupgradeneeded = (event) => {
                debug('需要升级数据库 ' + db.name);
                handleErr(event);
            };
            DBOpenRequest.onblocked = (event) => {
                debug('加载数据库 ' + db.name + ' 被阻止');
                handleErr(event);
            };
            DBOpenRequest.onerror = (event) => {
                debug('加载数据库 ' + db.name + ' 出错');
                handleErr(event);
            };
            DBOpenRequest.onsuccess = () => {
                debug('已打开 ' + db.name);
                const storenames = [];
                const numstores = DBOpenRequest.result.objectStoreNames.length;
                debug(db.name + ' (' + numstores + ' 个对象存储)');
                for (let idx = 0; idx < numstores; idx++) {
                    const storename = DBOpenRequest.result.objectStoreNames[idx];
                    storenames.push(storename);
                }
                if (storenames.length > 0) {
                    const transaction = DBOpenRequest.result.transaction(storenames);
                    for (const storename of storenames) {
                        debug(db.name + ' > ' + storename);
                        const objectstore = transaction.objectStore(storename);
                        debug(db.name + ' > ' + storename + ' > 自动增量 = ' + objectstore.autoIncrement);
                        debug(db.name + ' > ' + storename + ' > 键 = ' + objectstore.keyPath);
                        for (let idx = 0; idx < objectstore.indexNames.length; idx++) {
                            debug(db.name + ' > ' + storename + ' > 索引 = ' + objectstore.indexNames[idx]);
                        }
                        const count = objectstore.count();
                        count.onsuccess = () => {
                            debug(db.name + ' > ' + storename + ' > 记录数 = ' + count.result);
                        };
                    }
                }

                DBOpenRequest.result.close();
            };
        }

        $scope.listDatabases = function () {
            divider('列出数据库');
            try {
                navigator.storage.estimate()
                    .then((estimate) => {
                        debug('存储配额: ' + estimate.quota);
                        debug('存储使用量: ' + estimate.usage);
                        if (estimate.usageDetails) {
                            for (const key of Object.keys(estimate.usageDetails)) {
                                debug('存储使用量 > ' + key + ' > ' + estimate.usageDetails[key]);
                            }
                        }
                        else {
                            debug('存储使用量详情不可用');
                        }
                    })
                    .catch(handleErr);

                window.indexedDB.databases()
                    .then((dbs) => {
                        dbs.forEach(debugDatabase);
                    })
                    .catch(handleErr);
            }
            catch (err) {
                handleErr(err);
            }
        };


        // -----


        function createNewAssetStore () {
            debug('创建新资源存储');
            const createrequest = window.indexedDB.open('mlforkidsAssets');
            createrequest.onupgradeneeded = function (event) {
                debug('createNewAssetStore > onupgradeneeded');
                event.target.result.createObjectStore('assets');
            };
            createrequest.onerror = function (event) {
                debug('createNewAssetStore > onerror');
                handleErr(event);
            };
            createrequest.onsuccess = function (event) {
                debug('createNewAssetStore > onsuccess');
                createrequest.result.close();
                versionChangePrompt();
            };
        }

        $scope.resetAssetsStore = function () {
            divider('重置资源存储');
            try {
                const DBDeleteRequest = window.indexedDB.deleteDatabase('mlforkidsAssets');
                DBDeleteRequest.onerror = (event) => {
                    debug('删除现有资源数据库失败');
                    handleErr(event);
                    debug('等待5秒后创建新数据库');
                    $timeout(createNewAssetStore, 5000);
                };
                DBDeleteRequest.onsuccess = (event) => {
                    debug('已删除现有资源数据库');
                    debug('等待5秒后创建新数据库');
                    $timeout(createNewAssetStore, 5000);
                };
                DBDeleteRequest.onblocked = () => {
                    debug('删除资源数据库被阻止（可能是因为其他浏览器标签页仍在使用该数据库）');
                };
            }
            catch (err) {
                handleErr(err);
            }
        };


        // -----


        function createNewProjectsStore () {
            debug('创建新项目存储');
            const createrequest = window.indexedDB.open('mlforkidsLocalProjects');
            createrequest.onupgradeneeded = function (event) {
                debug('createNewProjectStore > onupgradeneeded');
                const table = event.target.result.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
                table.createIndex('classid', 'classid', { unique: false });
            };
            createrequest.onerror = function (event) {
                debug('createNewProjectStore > onerror');
                handleErr(event);
            };
            createrequest.onsuccess = function (event) {
                debug('createNewProjectStore > onsuccess');
                createrequest.result.close();
                versionChangePrompt();
            };
        }

        $scope.resetProjectsStore = function () {
            divider('重置项目存储');
            try {
                const DBDeleteRequest = window.indexedDB.deleteDatabase('mlforkidsLocalProjects');
                DBDeleteRequest.onerror = (event) => {
                    debug('删除现有项目数据库失败');
                    handleErr(event);
                    debug('等待5秒后创建新数据库');
                    $timeout(createNewProjectsStore, 5000);
                };
                DBDeleteRequest.onsuccess = (event) => {
                    debug('已删除现有项目数据库');
                    debug('等待5秒后创建新数据库');
                    $timeout(createNewProjectsStore, 5000);
                };
                DBDeleteRequest.onblocked = (event) => {
                    debug('删除项目数据库被阻止（可能是因为其他浏览器标签页仍在使用该数据库）');
                };
            }
            catch (err) {
                handleErr(err);
            }
        };

        $scope.clearTensorflowStore = function () {
            divider('清除Tensorflow存储');
            try {
                const DBDeleteRequest = window.indexedDB.deleteDatabase('tensorflowjs');
                DBDeleteRequest.onerror = (event) => {
                    debug('删除现有tensorflowjs数据库失败');
                    handleErr(event);
                };
                DBDeleteRequest.onsuccess = (event) => {
                    debug('已删除现有tensorflowjs数据库');
                    versionChangePrompt();
                };
                DBDeleteRequest.onblocked = (event) => {
                    debug('删除tensorflowjs数据库被阻止（可能是因为其他浏览器标签页仍在使用该数据库）');
                };
            }
            catch (err) {
                handleErr(err);
            }
        };

        $scope.clearLocalStorage = function () {
            divider('清除本地存储');
            try {
                debug('清除中');
                storageService.clear();
                debug('已清除');
                versionChangePrompt();
            }
            catch (err) {
                handleErr(err);
            }
        }
    }
}());