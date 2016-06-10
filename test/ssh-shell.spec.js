'use strict';

const SshShell = require('../');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const DEBUG = process.env.DEBUG;
const utils = require('./utils.js');

describe('Local Shell', function(){
    var server, shell, filename;

    before(function(){
        filename = path.basename(__filename);

        return require('./test-server.js')(2222)
        .then(function(_server){
            server = _server;

            shell = new SshShell({
                host: '127.0.0.1',
                port: 2222,
                // privateKey: __dirname + '/key',
                // passphrase: 'password',
                username: 'test',
                password: 'test',
                cwd: __dirname,
            });

            if (DEBUG) {
                shell.on('exec', function (cmd){
                    console.log('command:\n', cmd);
                });
            }

            return shell.open();
        });
    });

    after(function(){
        shell && shell.close();
        server && server.close();
    });

    it('Should execute the code', function(){
        return shell.exec('ls -l')
        .then(function(result){
            var {code, io} = result;

            assert.equal(code, 0, 'Exit code is 0');
            assert.ok(io.toString().indexOf(path.basename(__filename)) > -1, 'Current file is in `ls -l` output');
        });
    });

    it('Should use variables', function(){
        shell.set('VAR', '1');
        return shell.exec('echo Hello $VAR')
        .then(function(result){
            var {code, io} = result;
            assert.equal(code, 0, 'Exit code is 0');
            assert.equal(io.toString(), 'Hello 1\n', 'Variable works fine');
        });
    });
});
