// 核心依赖
import * as fs from 'fs';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { pipeline, Writable, Readable } from 'node:stream';
// 外部依赖
import { status as httpstatus } from 'http-status';
import * as sharp from 'sharp';
import * as got from 'mlforkids-got';
import * as googleDns from 'mlforkids-google-dns';
// 本地依赖
import loggerSetup from './logger';

const log = loggerSetup();


type IErrCallback = (err?: ML4KError) => void;


// 禁用激进的内存缓存使用
sharp.cache(false);
// 防止 sharp 使用多核并行以减少内存使用
sharp.concurrency(1);

// 下载图像的标准选项
const REQUEST_OPTIONS = {
    http2 : true,
    dnsCache : true, // 在 googleDns 模块加载后替换
    timeout : { request : 20000 },
    https : { rejectUnauthorized : false },
    decompress : true,
    headers : {
        // 标识请求来源
        //  部分原因是出于礼貌和良好实践，
        //  部分原因是某些网站会阻止未指定用户代理的请求
        'User-Agent': 'machinelearningforkids.co.uk',
        // 如果有选择，优先选择图像
        'Accept': 'image/png,image/jpeg,image/*,*/*',
        // 某些服务器会阻止不包含此内容的请求
        'Accept-Language': '*',
    },
    throwHttpErrors: false,
};

const RESIZE_OPTIONS = {
    // 调整大小时进行拉伸，不裁剪
    fit : 'fill',
} as sharp.ResizeOptions;


export interface ML4KError extends Error {
    ml4k: boolean;
}


/**
 * 从指定 URL 下载文件到磁盘上的指定位置。
 *
 * @param url  - 下载来源
 * @param targetFilePath  - 写入位置
 */
export function file(url: string, targetFilePath: string, callback: IErrCallback): void {
    // 用于避免多次调用回调的本地内部函数
    let resolved = false;
    function resolve(err?: ML4KError) {
        if (resolved === false) {
            resolved = true;
            if (err) {
                cleanupStream(readStream);
                cleanupStream(writeStream);
                return reportDownloadFailure(url, err, callback);
            }
            else {
                return callback();
            }
        }
    }

    // 从 url 下载
    const readStream = got.stream(url, REQUEST_OPTIONS)
        .on('response', (r: IncomingMessage) => {
            const problem = recognizeCommonProblems(r, url);
            if (problem) {
                resolve(problem);
                r.destroy();
            }
        })
        .on('error', (err: Error) => {
            resolve(err as ML4KError);
        });
    // 写入文件
    const writeStream = fs.createWriteStream(targetFilePath)
        .on('error', (err: Error) => {
            resolve(err as ML4KError);
        });

    // 连接两个流
    pipeline(readStream, writeStream, (err) => {
        resolve(err as ML4KError);
    });
}

function cleanupStream(str: Readable | Writable): void {
    if (str && !str.destroyed) {
        try {
            str.destroy();
        }
        catch (err) {}
    }
}



function reportDownloadFailure(url: string, err: ML4KError, callback: IErrCallback): void {
    if (err.ml4k) {
        log.debug({ err, url }, '下载失败（已知原因）');
        callback(err);
    }
    else {
        log.error({ err, url }, '下载失败');
        callback(returnAsMl4kError(new Error(ERRORS.DOWNLOAD_FAIL + url)));
    }
}

function returnAsMl4kError(err: Error): ML4KError {
    const modifyErr = err as ML4KError;
    modifyErr.ml4k = true;
    return modifyErr;
}


function recognizeCommonProblems(response: IncomingMessage, url: string): ML4KError | undefined
{
    if (response.statusCode && response.statusCode >= 400) {
        if (response.statusCode === httpstatus.FORBIDDEN ||
            response.statusCode === httpstatus.UNAUTHORIZED)
        {
            return returnAsMl4kError(new Error(safeGetHost(url) + ERRORS.DOWNLOAD_FORBIDDEN));
        }
        else if (response.statusCode === httpstatus.NOT_FOUND || response.statusCode === httpstatus.INTERNAL_SERVER_ERROR)
        {
            return returnAsMl4kError(new Error(ERRORS.DOWNLOAD_FAIL + url));
        }
        else if (response.statusCode === httpstatus.TOO_MANY_REQUESTS)
        {
            return returnAsMl4kError(new Error(safeGetHost(url) + ERRORS.DOWNLOAD_TOO_MANY_REQUESTS));
        }

        log.error({ statusCode : response.statusCode, url }, '请求 URL 失败');
        return returnAsMl4kError(new Error(ERRORS.DOWNLOAD_FAIL + url));
    }

    if (downloadTooBig(response.headers)) {
        return returnAsMl4kError(new Error(ERRORS.DOWNLOAD_TOO_BIG));
    }

    if (response.headers['content-type'] &&
        response.headers['content-type'].startsWith('text/html') &&
        response.url && response.url.startsWith('https://accounts.google.com/'))
    {
        return returnAsMl4kError(new Error('Google' + ERRORS.DOWNLOAD_FORBIDDEN));
    }
}



/**
 * 检查图像下载的响应头是否表明
 * 图像太大而无法调整大小
 *
 * @returns true - 如果头信息表明图像太大
 */
export function downloadTooBig(headers: IncomingHttpHeaders): boolean {
    if (headers['content-length']) {
        const sizeStr = headers['content-length'];
        try {
            const sizeInt = parseInt(sizeStr, 10);
            if (sizeInt > 52428800) {
                return true;
            }
        }
        catch (err) {
            log.error({ err, sizeStr }, '无法解析 content-length 头信息');
        }
    }

    // 假设可能没问题
    return false;
}


export function resizeUrl(url: string, width: number, height: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const shrinkStream = sharp()
                                .resize(width, height, RESIZE_OPTIONS)
                                .on('error', reject)
                                .toBuffer((err, buff) => {
                                    if (err) {
                                        if (err.message === 'Input buffer contains unsupported image format' ||
                                            err.message.startsWith('Input buffer has corrupt header')) {
                                            return reject(new Error(ERRORS.DOWNLOAD_FILETYPE_UNSUPPORTED));
                                        }
                                        return reject(err);
                                    }
                                    return resolve(buff);
                                });

        got.stream(url, REQUEST_OPTIONS)
            .on('error', (err: any) => {
                log.warn({ err, url }, '下载失败');
                return reject(new Error(ERRORS.DOWNLOAD_FAIL + url));
            })
            .pipe(shrinkStream);
    });
}

export function resizeBuffer(imagedata: Buffer, width: number, height: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        sharp(imagedata)
            .resize(width, height, RESIZE_OPTIONS)
            .on('error', reject)
            .toBuffer((err, buff) => {
                if (err) {
                    log.error({ err }, '调整大小失败');
                    return reject(err);
                }
                return resolve(buff);
            });
    });
}



/**
 * 从完整 URL 返回主机名。如果提供的 url 字符串不是有效的
 * URL，则返回 "该网站"。
 */
function safeGetHost(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    }
    catch (err) {
        log.debug({ url }, '解析 URL 失败');
        return '该网站';
    }
}


export const ERRORS = {
    DOWNLOAD_FAIL : '无法从以下位置下载图像：',
    DOWNLOAD_FILETYPE_UNSUPPORTED : '不支持的图像文件类型',
    DOWNLOAD_FORBIDDEN : ' 不允许"儿童机器学习"使用该图像',
    DOWNLOAD_TOO_BIG : '图像太大无法使用。请选择其他图像。',
    DOWNLOAD_TOO_MANY_REQUESTS : ' 收到太多图像请求并已开始拒绝访问。'
};


log.debug('设置备用 DNS 缓存');
googleDns.getCacheableLookup()
    .then((dnsCache: any) => {
        REQUEST_OPTIONS.dnsCache = dnsCache;
        log.info('使用 Google DNS 下载图像');
    })
    .catch((err: Error) => {
        log.error({ err }, '无法使用 Google DNS');
    });