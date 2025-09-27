const gulp = require('gulp');
const bower = require('gulp-bower');
const ts = require('gulp-typescript');
const cleanCSS = require('gulp-clean-css');
const concat = require('gulp-concat');
const minify = require('gulp-uglify');
const rename = require('gulp-rename');
const ngAnnotate = require('gulp-ng-annotate-patched');
const sourcemaps = require('gulp-sourcemaps');
const download = require('gulp-download2');
const jsonminify = require('gulp-jsonminify');
const htmlminify = require('gulp-htmlmin');
const del = require('del');

const fs = require('fs');
const path = require('path');


const DEPLOYMENT = process.env.DEPLOYMENT;
console.log('Building for ' + DEPLOYMENT);

const paths = {
    datasets : ['resources/datasets/**/*.json'],
    json : ['src/**/*.json'],
    ts : ['src/**/*.ts'],
    tstest : ['src/tests/**/*.ts'],
    js : ['dist/**/*.js'],
    jslib : [
        'dist/lib/**/*.js', '!dist/lib/app.js',

        // files with type definitions only - not testable
        '!dist/lib/**/*-types.js',
    ],
    jstest : ['dist/tests/**/*.js'],
    css : ['public/app.css', 'public/components/**/*.css'],
    html : ['public/components/**/*.html'],
    webjs : [
        'public/init.js',
        'public/app.run.js',
        'public/components/**/*.js',
    ]
};

const htmlMinifyOptions = {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments : true
};


gulp.task('clean', () => {
    const tsProject = ts.createProject('tsconfig.json');
    const target = tsProject.config.compilerOptions.outDir;
    return del([target, './web']);
});

gulp.task('bower', function() {
    return bower({ cwd : './public', directory : '../web/static/bower_components' });
});
gulp.task('customwebcam', function() {
    return gulp.src('public/third-party/webcam-directive/webcam.js', { encoding : false })
                .pipe(gulp.dest('web/static/bower_components/webcam-directive/dist'));
});
gulp.task('custombootstrap', function() {
    return gulp.src('public/third-party/bootstrap/**', { encoding : false })
                .pipe(gulp.dest('web/static/bower_components/bootstrap/dist'));
});
gulp.task('customangularmaterial', function() {
    return gulp.src('public/third-party/angular-material/*.css', { encoding : false })
                .pipe(cleanCSS())
                .pipe(gulp.dest('web/static/bower_components/angular-material'));
});
gulp.task('papaparse', function() {
    return gulp.src([
        'node_modules/papaparse/papaparse.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/papaparse'));
});
gulp.task('boweroverrides', gulp.parallel('customwebcam', 'custombootstrap', 'customangularmaterial', 'papaparse'));

gulp.task('twitter', function() {
    return gulp.src('public/static-files/twitter-card.html', { encoding : false }).pipe(gulp.dest('web/dynamic'));
});


gulp.task('tensorflowjs', function() {
    return gulp.src([
        'node_modules/@tensorflow/tfjs/dist/tf.js',
        'node_modules/@tensorflow/tfjs/dist/tf.min.js',
        'node_modules/@tensorflow/tfjs/dist/tf.min.js.map'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tfjs'));
});
gulp.task('ydf-inference', function() {
    return gulp.src([
        'node_modules/ydf-inference/dist/inference.js',
        'node_modules/ydf-inference/dist/inference.wasm',
        // ydf-inference in the browser has a dependency on jszip
        'node_modules/jszip/dist/jszip.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/ydf-inference'));
});
gulp.task('tensorflowposenet', function() {
    return gulp.src([
        'node_modules/tensorflow-models-posenet/dist/posenet.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tensorflow-models/posenet'));
});

// gulp.task('posenetmodel', function() {
//     const files = [
//         { url : 'https://storage.googleapis.com/tfjs-models/savedmodel/posenet/mobilenet/float/075/model-stride16.json', file : 'model-multiplier75-stride16.json' },
//         { url : 'https://storage.googleapis.com/tfjs-models/savedmodel/posenet/mobilenet/float/075/group1-shard1of2.bin', file : 'group1-shard1of2.bin' },
//         { url : 'https://storage.googleapis.com/tfjs-models/savedmodel/posenet/mobilenet/float/075/group1-shard2of2.bin', file : 'group1-shard2of2.bin' }
//     ];

//     // 如果只要有一个文件存在，就直接跳过
//     const targetDir = 'web/static/bower_components/tensorflow-models/posenet';
//     const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));

//     if (anyExist) {
//         console.log('posenetmodel: 已存在文件，跳过下载');
//         return Promise.resolve();
//     }

//     return download(files)
//         .pipe(gulp.dest('web/static/bower_components/tensorflow-models/posenet'));
// });
gulp.task('posenetmodel', function() {
    const files = [
        { file: 'model-multiplier75-stride16.json' },
        { file: 'group1-shard1of2.bin' },
        { file: 'group1-shard2of2.bin' }
    ];

    const sourceDir = '../models/posenet'; // 上级目录中的 models/posenet
    const targetDir = 'web/static/bower_components/tensorflow-models/posenet';
    
    // 检查目标目录中是否已存在任何文件
    const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));
    
    if (anyExist) {
        console.log('posenetmodel: 目标路径已存在文件，跳过拷贝');
        return Promise.resolve();
    }
    
    // 检查源目录中是否存在所有需要的文件
    const allSourceExist = files.every(f => fs.existsSync(path.join(sourceDir, f.file)));
    
    if (!allSourceExist) {
        console.log('posenetmodel: 错误 - 源目录中缺少必要的文件');
        console.log('请确保以下文件存在于 ' + sourceDir + ' 目录中:');
        files.forEach(f => console.log('  - ' + f.file));
        return Promise.reject('源文件不完整');
    }
    
    // 使用 gulp.src 从源目录拷贝文件到目标目录
    return gulp.src(files.map(f => path.join(sourceDir, f.file)))
        .pipe(gulp.dest(targetDir));
});

gulp.task('tensorflowspeechcommands', function() {
    return gulp.src([
        'node_modules/tensorflow-models-speech-commands/dist/speech-commands.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tensorflow-models/speech-commands'));
});
gulp.task('tensorflowspeechcommands-scratch', function() {
    return gulp.src([
        'node_modules/tensorflow-models-speech-commands/dist/speech-commands.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tensorflow-models/speech-commands-scratch'));
});

// gulp.task('speechcommandsmodel', function() {
//     const files = [
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/metadata.json', file : 'metadata.json' },
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/model.json', file : 'model.json' },
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/group1-shard1of2', file : 'group1-shard1of2' },
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/group1-shard2of2', file : 'group1-shard2of2' }
//     ];

//     // 如果只要有一个文件存在，就直接跳过
//     const targetDir = 'web/static/bower_components/tensorflow-models/speech-commands';
//     const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));

//     if (anyExist) {
//         console.log('posenetmodel: 已存在文件，跳过下载');
//         return Promise.resolve();
//     }

//     return download(files)
//         .pipe(gulp.dest('web/static/bower_components/tensorflow-models/speech-commands'));
// });
gulp.task('speechcommandsmodel', function() {
    const files = [
        { file: 'metadata.json' },
        { file: 'model.json' },
        { file: 'group1-shard1of2' },
        { file: 'group1-shard2of2' }
    ];

    const sourceDir = '../models/speech-commands'; // 上级目录中的 models/speech-commands
    const targetDir = 'web/static/bower_components/tensorflow-models/speech-commands';
    
    // 检查目标目录中是否已存在任何文件
    const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));
    
    if (anyExist) {
        console.log('speechcommandsmodel: 目标路径已存在文件，跳过拷贝');
        return Promise.resolve();
    }
    
    // 检查源目录中是否存在所有需要的文件
    const allSourceExist = files.every(f => fs.existsSync(path.join(sourceDir, f.file)));
    
    if (!allSourceExist) {
        console.log('speechcommandsmodel: 错误 - 源目录中缺少必要的文件');
        console.log('请确保以下文件存在于 ' + sourceDir + ' 目录中:');
        files.forEach(f => console.log('  - ' + f.file));
        return Promise.reject('源文件不完整');
    }
    
    // 使用 gulp.src 从源目录拷贝文件到目标目录
    return gulp.src(files.map(f => path.join(sourceDir, f.file)))
        .pipe(gulp.dest(targetDir));
});

// gulp.task('speechcommandsmodel-scratch', function() {
//     const files = [
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/metadata.json', file : 'metadata.json' },
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/model.json', file : 'model.json' },
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/group1-shard1of2', file : 'group1-shard1of2' },
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.5/browser_fft/18w/group1-shard2of2', file : 'group1-shard2of2' }
//     ];

//     // 如果只要有一个文件存在，就直接跳过
//     const targetDir = 'web/static/bower_components/tensorflow-models/speech-commands-scratch';
//     const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));

//     if (anyExist) {
//         console.log('posenetmodel: 已存在文件，跳过下载');
//         return Promise.resolve();
//     }

//     return download(files)
//         .pipe(gulp.dest('web/static/bower_components/tensorflow-models/speech-commands-scratch'));
// });
gulp.task('speechcommandsmodel-scratch', function() {
    const files = [
        { file: 'metadata.json' },
        { file: 'model.json' },
        { file: 'group1-shard1of2' },
        { file: 'group1-shard2of2' }
    ];

    const sourceDir = '../models/speech-commands'; // 上级目录中的 models/speech-commands
    const targetDir = 'web/static/bower_components/tensorflow-models/speech-commands-scratch';
    
    // 检查目标目录中是否已存在任何文件
    const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));
    
    if (anyExist) {
        console.log('speechcommandsmodel-scratch: 目标路径已存在文件，跳过拷贝');
        return Promise.resolve();
    }
    
    // 检查源目录中是否存在所有需要的文件
    const allSourceExist = files.every(f => fs.existsSync(path.join(sourceDir, f.file)));
    
    if (!allSourceExist) {
        console.log('speechcommandsmodel-scratch: 错误 - 源目录中缺少必要的文件');
        console.log('请确保以下文件存在于 ' + sourceDir + ' 目录中:');
        files.forEach(f => console.log('  - ' + f.file));
        return Promise.reject('源文件不完整');
    }
    
    // 使用 gulp.src 从源目录拷贝文件到目标目录
    return gulp.src(files.map(f => path.join(sourceDir, f.file)))
        .pipe(gulp.dest(targetDir));
});

gulp.task('tensorflowfacelandmarks', function() {
    return gulp.src([
        'node_modules/tensorflow-models-face-landmarks-detection/dist/face-landmarks-detection.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tensorflow-models/face-landmarks-detection'));
});
gulp.task('tensorflowfacemesh', function() {
    return gulp.src([
        'node_modules/@mediapipe/face_mesh/*'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tensorflow-models/face-mesh'));
});

// gulp.task('imagerecognitionmodel', function() {
//     const files = [
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json', file : 'model.json' }
//     ];
//     for (var x = 1; x <= 55; x++) {
//         const filename = 'group' + x + '-shard1of1';
//         files.push({
//             url : 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/' + filename,
//             file : filename
//         });
//     }

//     // 如果只要有一个文件存在，就直接跳过
//     const targetDir = 'web/static/bower_components/tensorflow-models/image-recognition';
//     const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));

//     if (anyExist) {
//         console.log('posenetmodel: 已存在文件，跳过下载');
//         return Promise.resolve();
//     }

//     return download(files)
//         .pipe(gulp.dest('web/static/bower_components/tensorflow-models/image-recognition'));
// });
gulp.task('imagerecognitionmodel', function() {
    const files = [
        { file: 'model.json' }
    ];
    for (var x = 1; x <= 55; x++) {
        const filename = 'group' + x + '-shard1of1';
        files.push({ file: filename });
    }

    const sourceDir = '../models/image-recognition'; // 上级目录中的 models/image-recognition
    const targetDir = 'web/static/bower_components/tensorflow-models/image-recognition';
    
    // 检查目标目录中是否已存在任何文件
    const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));
    
    if (anyExist) {
        console.log('imagerecognitionmodel: 目标路径已存在文件，跳过拷贝');
        return Promise.resolve();
    }
    
    // 检查源目录中是否存在所有需要的文件
    const allSourceExist = files.every(f => fs.existsSync(path.join(sourceDir, f.file)));
    
    if (!allSourceExist) {
        console.log('imagerecognitionmodel: 错误 - 源目录中缺少必要的文件');
        console.log('请确保以下文件存在于 ' + sourceDir + ' 目录中:');
        // 只列出前几个文件作为示例，避免输出过多
        files.slice(0, 5).forEach(f => console.log('  - ' + f.file));
        if (files.length > 5) {
            console.log('  以及另外 ' + (files.length - 5) + ' 个文件');
        }
        return Promise.reject('源文件不完整');
    }
    
    // 使用 gulp.src 从源目录拷贝文件到目标目录
    return gulp.src(files.map(f => path.join(sourceDir, f.file)))
        .pipe(gulp.dest(targetDir));
});

// gulp.task('imagerecognitionmodel-scratch', function() {
//     const files = [
//         { url : 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json', file : 'model.json' }
//     ];
//     for (var x = 1; x <= 55; x++) {
//         const filename = 'group' + x + '-shard1of1';
//         files.push({
//             url : 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/' + filename,
//             file : filename
//         });
//     }

//     // 如果只要有一个文件存在，就直接跳过
//     const targetDir = 'web/static/bower_components/tensorflow-models/image-recognition-scratch';
//     const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));

//     if (anyExist) {
//         console.log('posenetmodel: 已存在文件，跳过下载');
//         return Promise.resolve();
//     }

//     return download(files)
//         .pipe(gulp.dest('web/static/bower_components/tensorflow-models/image-recognition-scratch'));
// });
gulp.task('imagerecognitionmodel-scratch', function() {
    const files = [
        { file: 'model.json' }
    ];
    for (var x = 1; x <= 55; x++) {
        const filename = 'group' + x + '-shard1of1';
        files.push({ file: filename });
    }

    const sourceDir = '../models/image-recognition-scratch'; // 上级目录中的 models/image-recognition-scratch
    const targetDir = 'web/static/bower_components/tensorflow-models/image-recognition-scratch';
    
    // 检查目标目录中是否已存在任何文件
    const anyExist = files.some(f => fs.existsSync(path.join(targetDir, f.file)));
    
    if (anyExist) {
        console.log('imagerecognitionmodel-scratch: 目标路径已存在文件，跳过拷贝');
        return Promise.resolve();
    }
    
    // 检查源目录中是否存在所有需要的文件
    const allSourceExist = files.every(f => fs.existsSync(path.join(sourceDir, f.file)));
    
    if (!allSourceExist) {
        console.log('imagerecognitionmodel-scratch: 错误 - 源目录中缺少必要的文件');
        console.log('请确保以下文件存在于 ' + sourceDir + ' 目录中:');
        // 只列出前几个文件作为示例，避免输出过多
        files.slice(0, 5).forEach(f => console.log('  - ' + f.file));
        if (files.length > 5) {
            console.log('  以及另外 ' + (files.length - 5) + ' 个文件');
        }
        return Promise.reject('源文件不完整');
    }
    
    // 使用 gulp.src 从源目录拷贝文件到目标目录
    return gulp.src(files.map(f => path.join(sourceDir, f.file)))
        .pipe(gulp.dest(targetDir));
});

gulp.task('tensorflowhandposemodel', function() {
    return gulp.src([
        'node_modules/tensorflow-models-handpose/dist/handpose.min.js'
    ], { encoding : false }).pipe(gulp.dest('web/static/bower_components/tensorflow-models/handpose'));
});
gulp.task('tfjs',
    gulp.parallel('tensorflowjs',
        'ydf-inference',
        'tensorflowspeechcommands', 'tensorflowspeechcommands-scratch',
        'speechcommandsmodel', 'speechcommandsmodel-scratch',
        'tensorflowposenet', 'posenetmodel',
        'tensorflowfacelandmarks', 'tensorflowfacemesh',
        'tensorflowhandposemodel',
        'imagerecognitionmodel', 'imagerecognitionmodel-scratch'));

gulp.task('scratchblocks', function() {
    return gulp.src('public/third-party/scratchblocks-v3.1-min.js', { encoding : false }).pipe(gulp.dest('web/static'));
});

gulp.task('robotstxt', function() {
    return gulp.src([
        'public/static-files/robots.txt',
        'public/static-files/sitemap.xml',
        'public/images/favicon.ico'
    ], { encoding : false }).pipe(gulp.dest('web/dynamic'));
});

gulp.task('stories', function() {
    return gulp.src([
        'public/static-files/stories/*'
    ], { encoding : false }).pipe(gulp.dest('web/static/stories'));
});

gulp.task('scratch3install', function() {
    return gulp.src([
        'public/scratch3/**',
        'public/scratch-components/help-scratch3*',
        'public/scratch-components/help-scratch.css',
        'public/scratch-components/teachablemachinepose.html'
    ], { encoding : false }).pipe(gulp.dest('web/scratch3'));
});

gulp.task('compile', () => {
    let errors = false;

    const tsProject = ts.createProject('tsconfig.json');
    const target = tsProject.config.compilerOptions.outDir;

    const tsResult = tsProject.src()
        .pipe(tsProject())
        .on('error', () => { errors = true; });
    return tsResult.js
        .pipe(gulp.dest(target))
        .on('finish', () => { errors && process.exit(1); });
});



function prepareHtml (isForProd) {
    const options = { DEPLOYMENT };
    if (isForProd) {
        options.USE_IN_PROD_ONLY = '         ';
        options.AFTER_USE_IN_PROD_ONLY = '          ';
    }
    else {
        options.USE_IN_PROD_ONLY = '<!--';
        options.AFTER_USE_IN_PROD_ONLY = '-->';
    }

    return import('gulp-template')
        .then((module) => {
            const template = module.default;
            return gulp.src('public/index.html', { encoding : false })
                    .pipe(template(options))
                    .pipe(htmlminify(htmlMinifyOptions))
                    .pipe(gulp.dest('web/dynamic'));
        });
}

gulp.task('html', () => {
    return prepareHtml(false);
});
gulp.task('prodhtml', gulp.series('twitter', () => {
    return prepareHtml(true);
}));


gulp.task('css', gulp.series('html', () => {
    return import ('gulp-autoprefixer')
        .then((module) => {
            autoprefixer = module.default;
            return gulp.src(paths.css, { encoding : false })
                    .pipe(cleanCSS())
                    .pipe(autoprefixer())
                    .pipe(concat('style.min.css'))
                    .pipe(gulp.dest('web/static'));
        });
}));

gulp.task('jsapp', () => {
    return import('gulp-template')
        .then((module) => {
            const template = module.default;
            return gulp.src('public/app.js', { encoding : false })
                    .pipe(template({ DEPLOYMENT }))
                    .pipe(rename('app.js'))
                    .pipe(gulp.dest('web/static'));
        });
});

gulp.task('angularcomponents', gulp.series('jsapp', () => {
    return gulp.src(paths.html, { encoding : false })
            .pipe(htmlminify(htmlMinifyOptions))
            .pipe(gulp.dest('web/static/components'));
}));

gulp.task('datasets', () => {
    return gulp.src(paths.datasets, { encoding : false })
        .pipe(jsonminify())
        .pipe(gulp.dest('web/static/datasets'));
});

gulp.task('languages', () => {
    return gulp.src('public/languages/**', { encoding : false })
        .pipe(gulp.dest('web/static/languages'));
});

gulp.task('prodlanguages', () => {
    return gulp.src('public/languages/**', { encoding : false })
        .pipe(jsonminify())
        .pipe(gulp.dest('web/static/languages'));
});

gulp.task('images', () => {
    return gulp.src('public/images/*', { encoding : false }).pipe(gulp.dest('web/static/images'));
});

function concatAndMinifiyWebJs (isForProd) {
    let additionalVariables;
    if (process.env.DEPLOYMENT === 'machinelearningforkids.co.uk') {
        if (isForProd) {
            additionalVariables = [
                // sentry alerting support
                'public/prod-sentry.js',
                // uses prod auth0 environment
                'public/auth0-prod-variables.js'
            ];
        }
        else {
            // uses dev/staging auth0 environment
            additionalVariables = ['public/auth0-variables.js'];
        }
    }
    else {
        // disables auth0 integration
        additionalVariables = ['public/auth0-dev-variables.js'];
    }
    const webJsWithAuth = additionalVariables.concat(paths.webjs);

    return gulp.src(webJsWithAuth, { encoding : false })
            .pipe(sourcemaps.init())
                .pipe(ngAnnotate())
                .pipe(concat('mlapp.js'))
                .pipe(minify())
                .pipe(rename({ extname : '.min.js' }))
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest('web/static'));
}

gulp.task('minifyjs', () => {
    return concatAndMinifiyWebJs(false);
});
gulp.task('minifyprodjs', () => {
    return concatAndMinifiyWebJs(true);
});


gulp.task('test', () => {
    const mochaOptions = {
        reporter : 'spec',
        timeout : 60000
    };

    return import('gulp-mocha')
        .then((module) => {
            const mocha = module.default;
            return gulp.src(paths.jstest, { encoding : false })
                    .pipe(mocha(mochaOptions));
        });
});

gulp.task('scratch', gulp.parallel('scratch3install', 'scratchblocks'));

gulp.task('web',
    gulp.series(
        'css',
        'minifyjs',
        'images',
        'html',
        'angularcomponents',
        'prodlanguages',
        'datasets'));

gulp.task('uidependencies',
    gulp.series('bower', 'tfjs', 'boweroverrides'));

gulp.task('build',
    gulp.parallel('web', 'compile'));

gulp.task('default', gulp.series('build', 'test'));


gulp.task('buildprod',
    gulp.series(
        // 'clean',
        'uidependencies',
        gulp.parallel(
            'robotstxt',
            'css',
            'minifyprodjs',
            'images',
            'prodhtml',
            'angularcomponents',
            'prodlanguages',
            'scratchblocks',
            'stories'),
        'datasets',
        'compile'));
