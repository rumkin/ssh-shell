'use strict';

const ssh2 = require('ssh2');
const exec = require('child_process').exec;
const fs = require('fs');
const chalk = require('chalk');
const DEBUG = !! process.env.DEBUG;

module.exports = function(port) {
    return new Promise(function(resolve, reject){
        var server = new ssh2.Server({
            hostKeys: [{
                key: fs.readFileSync(__dirname + '/key', 'utf8'),
                passphrase: 'password',
            }],
        }, (client) => {
            client.on('authentication', (ctx) => {
                if (
                    ctx.method === 'password'
                    && ctx.username === 'test'
                    && ctx.password === 'test'
                ) {
                    ctx.accept();
                } else {
                    ctx.reject();
                }
            })
            .on('ready', () => {
                // Authenticated
                client.on('session', (accept, reject) => {
                    var session = accept();
                    var env = Object.create(process.env);

                    session.on('env', function(accept, reject, info){
                        DEBUG && console.error('Set env %s=%s', info.key, info.val);

                        if (info.val === '') {
                            delete env[info.key];
                        } else {
                            env[info.key] = [info.val];
                        }
                    });

                    session.on('exec', (accept, reject, info) => {
                        var channel = accept();

                        var child = exec(info.command, {env});

                        child.stdout.pipe(channel);
                        child.stderr.pipe(channel.stderr);
                        child.on('close', code => channel.exit(code));
                    });

                    session.on('sftp', function(accept, reject){
                        accept();
                    });
                });
            });
        });

        server.on('error', reject);
        server.listen(port, '127.0.0.1', function(){
            resolve(server);
        });
    });
};
