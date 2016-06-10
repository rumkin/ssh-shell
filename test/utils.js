const fs = require('fs');

exports.removeFile = function (filepath) {
    return new Promise((resolve, reject) => {
        fs.exists(filepath, function(exists){
            if (! exists) {
                resolve();
                return;
            }


            fs.unlink(filepath, function(error){
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    });
};
