"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const index_1 = require("../src/index");
const sampleURL = 'http://localhost:8080';
// Ensure helper builds URLs relative to base.
(0, node_test_1.test)('buildURL normalizes leading slash', () => {
    process.env.OPSORCH_CORE_URL = sampleURL;
    strict_1.default.equal((0, index_1.buildURL)('health'), `${sampleURL}/health`);
    strict_1.default.equal((0, index_1.buildURL)('/health'), `${sampleURL}/health`);
});
(0, node_test_1.test)('asContent wraps strings and objects', () => {
    const str = (0, index_1.asContent)('ok');
    strict_1.default.ok(str.content[0]);
    strict_1.default.equal(str.content[0].text, 'ok');
    strict_1.default.equal(str.structuredContent, 'ok');
    const obj = (0, index_1.asContent)({ a: 1 });
    strict_1.default.ok(obj.content[0]);
    strict_1.default.equal(obj.content[0].text.includes('"a": 1'), true);
    strict_1.default.deepEqual(obj.structuredContent, { a: 1 });
});
(0, node_test_1.test)('coreRequest forwards headers/body and parses JSON', async () => {
    process.env.OPSORCH_CORE_URL = sampleURL;
    process.env.OPSORCH_CORE_TOKEN = 'token123';
    const restore = node_test_1.mock.method(global, 'fetch', async (url, init) => {
        strict_1.default.equal(url, `${sampleURL}/health`);
        strict_1.default.equal(init?.method, 'GET');
        strict_1.default.equal(init?.headers && init.headers['Content-Type'], 'application/json');
        strict_1.default.equal(init?.headers && init.headers.Authorization, 'Bearer token123');
        strict_1.default.equal(init?.body, null);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });
    try {
        const res = await (0, index_1.coreRequest)('/health', 'GET');
        strict_1.default.deepEqual(res, { status: 'ok' });
    }
    finally {
        restore.mock.restore();
    }
});
(0, node_test_1.test)('coreRequest surfaces HTTP errors with body message', async () => {
    process.env.OPSORCH_CORE_URL = sampleURL;
    const restore = node_test_1.mock.method(global, 'fetch', async () => {
        return new Response(JSON.stringify({ message: 'bad' }), { status: 500, statusText: 'Internal' });
    });
    try {
        await strict_1.default.rejects((0, index_1.coreRequest)('/health', 'GET'), /OpsOrch Core 500: bad/);
    }
    finally {
        restore.mock.restore();
    }
});
//# sourceMappingURL=core.test.js.map