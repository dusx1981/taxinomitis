// external dependencies
import * as nodemailer from 'nodemailer';
import * as SMTPPool from 'nodemailer/lib/smtp-pool';
import * as Mailer from 'nodemailer/lib/mailer';
import * as Mustache from 'mustache';
// local dependencies
import * as fileutils from '../utils/fileutils';
import { SupervisorInfo } from '../auth0/auth-types';
import * as env from '../utils/env';
import loggerSetup from '../utils/logger';

const log = loggerSetup();

// mustache has an unbounded cache which appears like a memory leak
//  as all emails ever generated are kept in memory
// doing this disables the cache to avoid the memory leak
// cf. https://github.com/janl/mustache.js/blob/master/CHANGELOG.md#400--16-january-2020
// @ts-expect-error workaround for mustache issue
Mustache.templateCache = undefined;


let transporter: nodemailer.Transporter | undefined;


export function init(): Promise<void> {
    const user = process.env[env.SMTP_USER];
    const pass = process.env[env.SMTP_PASS];

    if (user && pass &&
        process.env[env.SMTP_HOST] && process.env[env.SMTP_PORT] &&
        process.env[env.SMTP_REPLY_TO])
    {
        const mailOptions: SMTPPool.Options = {
            name : 'machinelearningforkids.co.uk',
            host : process.env[env.SMTP_HOST],
            port : parseInt(process.env[env.SMTP_PORT] as string, 10),
            secure : true,
            auth : { user, pass },
            pool : true,
        };
        const mailDefaults = {
            from : '儿童机器学习 <' + process.env[env.SMTP_USER] + '>',
            replyTo : process.env[env.SMTP_REPLY_TO],
        };

        const verifyTransporter = nodemailer.createTransport(mailOptions, mailDefaults);

        return verifyTransporter.verify()
            .then(() => {
                transporter = verifyTransporter;

                log.info('电子邮件凭据已验证');
            })
            .catch((err) => {
                log.error({ err }, '验证电子邮件凭据失败。电子邮件发送功能已禁用。');
            });
    }
    else {
        log.info('缺少发送电子邮件所需的字段。电子邮件发送功能已禁用。');
        return Promise.resolve();
    }
}


export function close() {
    if (transporter) {
        transporter.close();
        transporter = undefined;
    }
}


export async function deletedClass(tenant: string, teachers: SupervisorInfo[]): Promise<void[]> {
    return Promise.all(
        teachers.map((teacher) => {
            return sendEmailToUser(teacher, tenant, EMAILS.deletedclass, { classid: tenant }, true);
        }));
}

export interface DeletedClass {
    readonly classid: string;
}


const EMAILS: { [key: string]: EmailTemplate } = {
    deletedclass : {
        root : './resources/email-deleted-class.',
        subject : '再见',
    },
};



async function sendEmailToUser(
    teacher: SupervisorInfo, tenant: string,
    templateinfo: EmailTemplate, values: EmailValues,
    copyAdmin: boolean): Promise<void>
{
    if (!transporter) {
        log.error('由于发送器未初始化，跳过发送电子邮件');
        return;
    }

    const TEMPLATE_ROOT = templateinfo.root;
    const templateText: string = await fileutils.read(TEMPLATE_ROOT + 'txt');
    const templateHtml: string = await fileutils.read(TEMPLATE_ROOT + 'html');

    const email: Mailer.Options = {
        subject : templateinfo.subject,
        to : teacher.email,
        bcc : copyAdmin ? 'dale.lane@uk.ibm.com' : [],
        text : Mustache.render(templateText, values),
        html : Mustache.render(templateHtml, values),
    };

    log.info({ tenant, email : teacher.email, subject : templateinfo.subject }, '正在发送电子邮件');

    return transporter.sendMail(email);
}



interface EmailTemplate {
    readonly root: string;
    readonly subject: string;
}

type EmailValues = DeletedClass;