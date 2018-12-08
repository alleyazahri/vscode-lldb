import { QuickPickItem, WorkspaceConfiguration, DebugConfiguration, OutputChannel } from 'vscode';
import * as cp from 'child_process';
import { readdirAsync } from './async';
import { Dict } from './common';

let expandVarRegex = /\$\{(?:([^:}]+):)?([^}]+)\}/g;

export function expandVariables(str: string | String, expander: (type: string, key: string) => string): string {
    let result = str.replace(expandVarRegex, (all: string, type: string, key: string): string => {
        let replacement = expander(type, key);
        return replacement != null ? replacement : all;
    });
    return result;
}

export function expandVariablesInObject(obj: any, expander: (type: string, key: string) => string): any {
    if (typeof obj == 'string' || obj instanceof String)
        return expandVariables(obj, expander);

    if (isScalarValue(obj))
        return obj;

    if (obj instanceof Array)
        return obj.map(v => expandVariablesInObject(v, expander));

    for (let prop of Object.keys(obj))
        obj[prop] = expandVariablesInObject(obj[prop], expander)
    return obj;
}

// Expands variable references of the form ${dbgconfig:name} in all properties of launch configuration.
export function expandDbgConfig(debugConfig: DebugConfiguration, dbgconfigConfig: WorkspaceConfiguration): DebugConfiguration {
    let dbgconfig: Dict<any> = Object.assign({}, dbgconfigConfig);

    // Compute fixed-point of expansion of dbgconfig properties.
    let expanding = '';
    let converged = true;
    let expander = (type: string, key: string) => {
        if (type == 'dbgconfig') {
            if (key == expanding)
                throw new Error('Circular dependency detected during expansion of dbgconfig:' + key);
            let value = dbgconfig[key];
            if (value == undefined)
                throw new Error('dbgconfig:' + key + ' is not defined');
            converged = false;
            return value.toString();
        }
        return null;
    };
    do {
        converged = true;
        for (let prop of Object.keys(dbgconfig)) {
            expanding = prop;
            dbgconfig[prop] = expandVariablesInObject(dbgconfig[prop], expander);
        }
    } while (!converged);

    // Now expand dbgconfigs in the launch configuration.
    debugConfig = expandVariablesInObject(debugConfig, (type, key) => {
        if (type == 'dbgconfig') {
            let value = dbgconfig[key];
            if (value == undefined)
                throw new Error('dbgconfig:' + key + ' is not defined');
            return value.toString();
        }
        return null;
    });
    return debugConfig;
}

export async function getProcessList(currentUserOnly: boolean):
    Promise<(QuickPickItem & { pid: number })[]> {

    let is_windows = process.platform == 'win32';
    let command: string;
    if (!is_windows) {
        if (currentUserOnly)
            command = 'ps x';
        else
            command = 'ps ax';
    } else {
        if (currentUserOnly)
            command = 'tasklist /V /FO CSV /FI "USERNAME eq ' + process.env['USERNAME'] + '"';
        else
            command = 'tasklist /V /FO CSV';
    }
    let stdout = await new Promise<string>((resolve, reject) => {
        cp.exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout)
        })
    });
    let lines = stdout.split('\n');
    let items = [];

    let re: RegExp, idx: number[];
    if (!is_windows) {
        re = /^\s*(\d+)\s+.*?\s+.*?\s+.*?\s+(.*)()$/;
        idx = [1, 2, 3];
    } else {
        // name, pid, ..., window title
        re = /^"([^"]*)","([^"]*)",(?:"[^"]*",){6}"([^"]*)"/;
        idx = [2, 1, 3];
    }
    for (let i = 1; i < lines.length; ++i) {
        let groups = re.exec(lines[i]);
        if (groups) {
            let pid = parseInt(groups[idx[0]]);
            let name = groups[idx[1]];
            let descr = groups[idx[2]];
            let item = { label: `${pid}: ${name}`, description: descr, pid: pid };
            items.unshift(item);
        }
    }
    return items;
}

export function getConfigNoDefault(config: WorkspaceConfiguration, key: string): any {
    let x = config.inspect(key);
    let value = x.workspaceFolderValue;
    if (value === undefined)
        value = x.workspaceValue;
    if (value === undefined)
        value = x.globalValue;
    return value;
}

export function isEmpty(obj: any): boolean {
    if (obj === null || obj === undefined)
        return true;
    if (typeof obj == 'number' || obj instanceof Number)
        return false;
    if (typeof obj == 'string' || obj instanceof String)
        return obj.length == 0;
    if (obj instanceof Array)
        return obj.length == 0;
    return Object.keys(obj).length == 0;
}

export function mergeValues(value1: any, value2: any): any {
    if (value2 === undefined)
        return value1;
    // For non-container types, value2 wins.
    if (isScalarValue(value1))
        return value2;
    // Concatenate arrays.
    if (value1 instanceof Array && value2 instanceof Array)
        return value1.concat(value2);
    // Merge dictionaries.
    return Object.assign({}, value1, value2);
}

// Expand ${env:...} placeholders in extraEnv and merge it with the current process' environment.
export function mergeEnv(extraEnv: Dict<string>, ignoreCase = (process.platform == 'win32')): Dict<string> {
    let env = Object.assign({}, process.env);

    // Windows environment varibles are case-insensitive: for example, `Path` and `PATH` refer to the same variable.
    // We must preserve this behavior when merging them.
    let existingVars: Dict<string> = {};
    if (ignoreCase) {
        for (const key in env)
            existingVars[key.toUpperCase()] = key;
    }

    for (let key in extraEnv) {
        let mappedKey = existingVars[key.toUpperCase()] || key;
        env[mappedKey] = expandVariables(extraEnv[key], (type, key) => {
            if (type == 'env')
                return process.env[key];
            throw new Error('Unknown variable type ' + type);
        });
    }
    return env;
}

function isScalarValue(value: any): boolean {
    return value === null || value === undefined ||
        typeof value == 'boolean' || value instanceof Boolean ||
        typeof value == 'number' || value instanceof Number ||
        typeof value == 'string' || value instanceof String;
}

export function logProcessOutput(process: cp.ChildProcess, output: OutputChannel) {
    process.stdout.on('data', chunk => {
        output.append(chunk.toString());
    });
    process.stderr.on('data', chunk => {
        output.append(chunk.toString());
    });
}

export async function findFileByPattern(path: string, pattern: RegExp): Promise<string | null> {
    let files = await readdirAsync(path);
    for (let file of files) {
        if (pattern.test(file))
            return file;
    }
    return null;
}

export function setIfDefined(target: Dict<any>, config: WorkspaceConfiguration, key: string) {
    let value = getConfigNoDefault(config, key);
    if (value !== undefined)
        target[key] = value;
}

export async function readRegistry(path: string, value?: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let args = ['query', path];
        if (value != null)
            args.push('/v', value);
        else
            args.push('/ve');

        let reg = cp.spawn('reg.exe', args, {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        reg.on('error', (err) => reject(err));
        let stdout = '';
        reg.stdout.on('data', chunk => stdout += chunk.toString());
        reg.on('exit', code => {
            if (code != 0) {
                resolve(null);
            } else {
                let m = /REG_SZ\s+(.*)/.exec(stdout);
                if (m) {
                    resolve(m[1]);
                } else {
                    resolve(null);
                }
            }
        });
    });
}
