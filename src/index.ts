
import {get} from 'config';
import {createServer, IncomingMessage, ServerResponse} from 'http';
import { RequestProcessor } from './RequestProcessor';
import {$log} from "ts-log-debug";

$log.level = get('log.level');

const requestProcessor = new RequestProcessor();
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requestProcessor.process(req, res);
});

const port:number = get('port');
const hostInterface: string = get('interface');
server.listen(port, hostInterface);

$log.info(`Listening new requests on ${hostInterface}:${port}`);

