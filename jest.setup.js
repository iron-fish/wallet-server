const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

// Create working copy of test database
const sourceDir = path.join(__dirname, "test", "dbfixture", "cache");
const targetDir = path.join(__dirname, "test", "cache");

function copyDirectory(source, target) {
  return new Promise((resolve, reject) => {
    fs.readdir(source, (err, files) => {
      if (err) reject(err);

      const promises = files.map((file) => {
        return new Promise((resolve, reject) => {
          const sourceFile = path.join(source, file);
          const targetFile = path.join(target, file);

          fs.stat(sourceFile, (err, stats) => {
            if (err) reject(err);

            if (stats.isDirectory()) {
              fs.mkdir(targetFile, { recursive: true }, (err) => {
                if (err) reject(err);
                resolve(copyDirectory(sourceFile, targetFile));
              });
            } else {
              fs.copyFile(sourceFile, targetFile, (err) => {
                if (err) reject(err);
                resolve();
              });
            }
          });
        });
      });

      Promise.all(promises)
        .then(() => resolve())
        .catch((error) => reject(error));
    });
  });
}

module.exports = async () => {
  await copyDirectory(sourceDir, targetDir);
};
