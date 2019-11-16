import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import * as puppeteer from 'puppeteer';
import { start, stop } from '../../src';
import { createServer, Server } from 'http';

@suite()
class SSOFlow {
    private server: Server;

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
    }

    async after() {
        await stop();
        this.server.close();
        this.server = null;
    }

    @test()
    async SSOFlow() {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        console.log('-> Opening browser page');
        const page = await browser.newPage();
        console.log('-> Opening browser page');
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

        await browser.close();
    }
}
