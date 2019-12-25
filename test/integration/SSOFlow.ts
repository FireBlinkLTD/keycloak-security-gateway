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

                    return;
                }

                res.statusCode = 200;
                res.setHeader('content-type', 'application/json');
                res.write('{"success":true}', () => {
                    res.end();
                });
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
    async logoutWithDefaultRedirectURL() {
        console.log('-> Opening browser page');
        const page = await this.browser.newPage();

        console.log('-> Opening /sso/ page');
        await page.goto(get('host') + '/sso/test/', {
            waitUntil: 'networkidle0',
        });

        await this.login(page);

        // logout
        await this.getUnauthorized(page, '/logout');
        strictEqual(page.url(), get('host') + '/');
    }

    @test()
    async logoutWithRedirectURLFromQuery() {
        console.log('-> Opening browser page');
        const page = await this.browser.newPage();

        console.log('-> Opening /sso/ page');
        await page.goto(get('host') + '/sso/test/', {
            waitUntil: 'networkidle0',
        });

        await this.login(page);

        // logout
        await this.getJSON(page, '/logout?redirectTo=/public');

        // Go to root
        await this.getUnauthorized(page, '/');
        strictEqual(page.url(), get('host') + '/');
    }

    @test()
    async refreshTokenFlow() {
        console.log('-> Opening browser page');
        const page = await this.browser.newPage();

        console.log('-> Opening /sso/ page');
        await page.goto(get('host') + '/sso/test/', {
            waitUntil: 'networkidle0',
        });

        await this.login(page);

        // verify refresh token flow
        await page.setCookie({
            name: get('cookie.accessToken'),
            value: 'deleted',
            expires: new Date(0).getTime(),
        });

        await this.getJSON(page, '/api');
    }

    @test()
    async verifyRBAC() {
        console.log('-> Opening browser page');
        const page = await this.browser.newPage();

        await this.getUnauthorized(page, '/api');

        console.log('-> Opening /sso/ page');
        await page.goto(get('host') + '/sso/test/', {
            waitUntil: 'networkidle0',
        });

        await this.login(page);

        await page.screenshot({ path: 'report/2.png' });

        await this.getJSON(page, '/api');
        await this.getJSON(page, '/api/roles/all');
        await this.getJSON(page, '/api/roles/any');
    }

    /**
     * Make request and expect Unauthorized response
     * @param page
     * @param path
     */
    private async getUnauthorized(page: puppeteer.Page, path: string) {
        console.log(`-> Open ${path} page`);
        await page.goto(get('host') + path, {
            waitUntil: 'networkidle0',
        });

        const body = await page.evaluate(() => document.querySelector('pre').innerHTML);
        strictEqual(body, 'Unathorized');
    }

    /**
     * Make API request from page, expect successful response
     * @param page
     * @param path
     */
    private async getJSON(page: puppeteer.Page, path: string) {
        console.log(`-> Open ${path} page`);
        await page.goto(get('host') + path, {
            waitUntil: 'networkidle0',
        });

        const body = await page.evaluate(() => document.querySelector('pre').innerHTML);
        let json;

        try {
            json = JSON.parse(body);
        } catch (e) {
            throw new Error(`Unable to parse JSON on page with path ${path}`);
        }

        deepStrictEqual(json, { success: true });
    }

    /**
     * Handle login form
     * @param page
     */
    private async login(page: puppeteer.Page) {
        console.log('-> Waiting for login form to appear');
        await page.waitFor('#username');

        console.log('-> Filling login form');
        await page.focus('#username');
        await page.keyboard.type('test');

        await page.focus('#password');
        await page.keyboard.type('test');

        await page.click('#kc-login');

        console.log('-> Waiting for redirect to complete');
        await page.waitFor('#loginSuccess');
    }
}
