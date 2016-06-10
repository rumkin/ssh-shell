'use strict';

const fs = require('fs');
const path = require('path');
const ssh2 = require('ssh2');
const Shell = require('abstract-shell');
const IOString = require('io-string');

'use strict';

module.exports = SshShell;

function SshShell(options) {
    Shell.call(this);
    options = Object.assign({}, options);

    this.cwd = options.cwd || '$HOME';
    this.env = options.env || this.env;

    this.options = options;

    if (options.privateKey) {
      if (options.privateKey === true) {
        options.privateKey = process.env.HOME + '/.ssh/id_rsa'
      } else {
        options.privateKey = path.resolve(process.cwd(), options.privateKey);
      }

      options.privateKey = fs.readFileSync(options.privateKey, 'utf8');
    }
}

Object.setPrototypeOf(SshShell.prototype, Shell.prototype);

SshShell.prototype.open = function () {
    if (this.conn) {
        // TODO (rumkin) Recommend to disconnect first?
        throw new Error('Connection is opened');
    }

    var conn = this.conn = new ssh2.Client();
    var options = this.options;
    var opts = {};

    [
        'host',
        'port',
        'username',
        'password',
        'privateKey',
        'passphrase',
        'debug',
    ]
    .forEach(function(prop) {
        opts[prop] = options[prop];
    });

    return new Promise((resolve, reject) => {
        conn
        .on('ready', () => {
            resolve(this);
            this.emit('opened');
        })
        .connect(opts);
    });
};

SshShell.prototype.close = function () {
    this.conn.end();
    delete this.conn;
    return this;
};

SshShell.prototype.uploadBuffer = function (source, destination) {
    var remote = path.resolve(this.cwd, destination);

    return new Promise((resolve, reject) =>
        this.conn.sftp((error, sftp) => {
            if (error) {
                reject(error);
                return;
            }

            try {
                sftp.writeFile(remote, source, (error) => {
                    if (error) {
                        reject(err);
                        return;
                    }

                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        })
    );
};

SshShell.prototype.uploadFile = function (source, destination) {
    var local = path.resolve(process.cwd(), source);
    // FIXME (rumkin) replace basename with removing path's base.
    var remote = path.resolve(this.cwd, destination || path.basename(source));

    return new Promise((resolve, reject) =>
        this.conn.sftp((error, sftp) => {
            if (error) {
                reject(error);
                return;
            }

            try {
                sftp.fastPut(local, remote, (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        })
    );
};

SshShell.prototype.downloadFile = function(source, destination) {
    var local = path.resolve(this.cwd, source);
    // FIXME (rumkin) replace basename with removing path's base.
    var remote = path.resolve(process.cwd(), destination || path.basename(local));

    return new Promise((resolve, reject) =>
        this.conn.sftp((error, sftp) => {
            if (error) {
                reject(error);
                return;
            }

            try {
                sftp.fastGet(local, remote, (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        })
    );
};

SshShell.prototype.exec = function (cmd, options) {
    options = options || {};
    var env = Object.assign({}, this.env, options.env);

    if (Array.isArray(cmd)) {
        cmd = cmd.join('\n');
    }

    // Conver environment variables into shell command string
    if (this.options.stringEnv) {
        cmd = Object.getOwnPropertyNames(env).map(
            k => `export ${k}=${env[k]}`
        ).concat(cmd).join('\n');
        env = {};
    }

    var cwd = options.cwd || this.cwd;

    return new Promise((resolve, reject) => {
        cmd = `cd "${cwd}"\n` + cmd;
        this.emit('exec', cmd);

        this.conn.exec(cmd, {env: env}, (error, stream) => {
            if (error) {
                reject(error);
                return;
            }

            var io = [];

            io.toString = function () {
                return this.join('');
            };

            stream.on('close', (code, signal) => {
                resolve({
                    code: code || 0,
                    signal,
                    io
                });
            });

            stream.on('data', chunk => io.push(new IOString(chunk, 1)));
            stream.stderr.on('data', chunk => io.push(new IOString(chunk, 2)));
        });
    });
};

SshShell.prototype.batch = function (commands, options) {
    return new Promise((resolve, reject) => {
        var stack = commands.slice();

        var loop = (result) => {
            if (! stack.length) {
                resolve(result);
                return;
            }

            this.exec(stack.shift(), options).then(loop, reject);
        }

        loop();
    });
};
