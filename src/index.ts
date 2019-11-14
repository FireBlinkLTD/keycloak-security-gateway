
import {get} from 'config';
import {createServer, IncomingMessage, ServerResponse} from 'http';
import { RequestProcessor } from './RequestProcessor';
import {$log} from "ts-log-debug";

$log.level = get('log.level');

const requestProcessor = new RequestProcessor();
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requestProcessor.process(req, res);
});

const port = get('port');
server.listen(port);

$log.info('Listening new requests on port', port);