import * as assert from 'assert';
import * as ver from '../extension/ver';
import * as util from '../extension/util';
import { toAdapterType } from '../extension/common';

suite('Versions', () => {
    test('comparisons', async () => {
        assert.ok(ver.lt('1.0.0', '2.0.0'));
        assert.ok(ver.lt('2.0.0', '2.2.0'));
        assert.ok(ver.lt('2.0', '2.0.0'));
        assert.ok(ver.lt('2.0.0', '2.2'));
        assert.ok(ver.lt('2.0.0', '100.0.0'));
    })
})

suite('Util', () => {
    test('expandVariables', async () => {
        function expander(type: string, key: string) {
            if (type == 'echo') return key;
            if (type == 'reverse') return key.split('').reverse().join('');
            throw new Error('Unknown ' + type + ' ' + key);
        }

        assert.equal(util.expandVariables('', expander), '');
        assert.equal(util.expandVariables('AAAA${echo:TEST}BBBB', expander), 'AAAATESTBBBB');
        assert.equal(util.expandVariables('AAAA${}${echo:FOO}BBBB${reverse:BAR}CCCC', expander),
            'AAAA${}FOOBBBBRABCCCC');
        assert.throws(() => util.expandVariables('sdfhksadjfh${hren:FOO}wqerqwer', expander));
    })

    test('mergeValues', async () => {
        assert.deepEqual(util.mergeValues(10, undefined), 10);
        assert.deepEqual(util.mergeValues(false, true), true);
        assert.deepEqual(util.mergeValues(10, 0), 0);
        assert.deepEqual(util.mergeValues("100", "200"), "200");
        assert.deepEqual(util.mergeValues(
            [1, 2], [3, 4]),
            [1, 2, 3, 4]);
        assert.deepEqual(util.mergeValues(
            { a: 1, b: 2, c: 3 }, { a: 10, d: 40 }),
            { a: 10, b: 2, c: 3, d: 40 });
    })

    test('mergeEnv', async () => {
        process.env['Foo'] = '111';
        let env = util.mergeEnv({ 'FOO': '222' }, true);
        assert.equal(env['Foo'], '222');
        assert.equal(env['FOO'], undefined);

        process.env['Foo'] = '111';
        let env2 = util.mergeEnv({ 'FOO': '222' }, false);
        assert.equal(env2['Foo'], '111');
        assert.equal(env2['FOO'], '222');
    });
})
