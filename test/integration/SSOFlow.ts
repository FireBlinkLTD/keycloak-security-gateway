import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import * as puppeteer from 'puppeteer';
import { start, stop } from '../../src';
import { createServer, Server } from 'http';
import { deepStrictEqual, strictEqual } from 'assert';

@suite()
class SSOFlow {
    private server: Server;
    private browser: puppeteer.Browser;

    async before() {
        await start();

        await new Promise(resolve => {
            this.server = createServer((req, res) => {
                if (req.url === '/sso/') {
                    res.statusCode = 200;
                    res.write('<body id="loginSuccess"></body>', () => {
                        res.end();
                    });
                }

                if (req.url === '/api') {
                    res.statusCode = 200;
                    res.setHeader('content-type', 'application/json');
                    res.write('{"success":true}', () => {
                        res.end();
                    });
                }
            });
            this.server.listen(7777, '0.0.0.0', () => {
                resolve();
            });
        });

        this.browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }

    async after() {
        await this.browser.close();
        await stop();
        this.server.close();
        this.server = null;
    }

    @test()
    async SSOFlow() {        
        console.log('-> Opening browser page');
        const page = await this.browser.newPage();

        console.log('-> Opening /api page');
        await page.goto(get('host') + '/api', {
            waitUntil: 'networkidle0',
        });

        let body = await page.evaluate(() => document.querySelector('pre').innerHTML);
        strictEqual(body, 'Unathorized');
        
        console.log('-> Opening /sso/ page');
        await page.goto(get('host') + '/sso/', {
            waitUntil: 'networkidle0',
        });

        console.log('-> Waiting for login form to appear');
        await page.waitFor('#username');
        await page.screenshot({ path: 'report/1.png' });

        console.log('-> Filling login form');
        await page.focus('#username');
        await page.keyboard.type('test');

        await page.focus('#password');
        await page.keyboard.type('test');

        await page.click('#kc-login');

        console.log('-> Waiting for redirect to complete');
        await page.waitFor('#loginSuccess');

        await page.screenshot({ path: 'report/2.png' });

        console.log('-> Open /api page');
        await page.goto(get('host') + '/api', {
            waitUntil: 'networkidle0',
        });

        body = await page.evaluate(() => document.querySelector('pre').innerHTML);
        const json = JSON.parse(body);
        
        deepStrictEqual(json, {success: true});
    }
}
