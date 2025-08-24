import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
//
import { ArgumentParser } from 'argparse';
//
import * as setting from './setting.js';
import * as eagle from './eagle.js';
import * as utils from './utils.js';

const main = async () => {
  // get parameter
  const parser = new ArgumentParser({
    description: 'ZGQ Scrapper',
  });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './setting.zgq-tool.json' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
  const argv = parser.parse_args();
  // setting
  let allConfig = null;
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    //
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s };
  } catch (error) {
    console.log(`invalid parameter | --setting="${argv.setting}" --wkdir="${argv.wkdir}" | ${error.message}`);
    return 1;
  }
  // prepare
  let eagleFolder = null;
  const json = `${allConfig.runtime.wkdir}${path.sep}data.zgq.json`;
  const errorLog = `${allConfig.runtime.wkdir}${path.sep}log.error.update.zgq.txt`;
  fs.writeFileSync(errorLog, '', { encoding: 'utf-8' });
  //
  let data;
  try {
    data = JSON.parse(fs.readFileSync(json, { encoding: 'utf-8' }));
    //
    console.log(`Data is loaded from "[${json}]".`);
  } catch (_) {
    data = {};
  }
  //
  const timer = setInterval(() => {
    // write
    fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
    //
    console.log('☑️ auto save every 60 second(s)');
  }, 60000);
  let categoryNumber = 0;
  let imageNumber = 0;
  const categoryIdList = Object.keys(data);
  for (let i = 0; i < categoryIdList.length; i++) {
    const categoryId = categoryIdList[i];
    const category = data[categoryId];
    if (!category.imageMap) {
      continue;
    }
    categoryNumber += 1;
    const urlList = Object.keys(category.imageMap);
    for (let j = 0; j < urlList.length; j++) {
      const url = urlList[j];
      const value = category.imageMap[url];
      //
      // if (value.ocr && (typeof value.description === 'string') && !value.eagleFixed) {
      //   let text = value.description;
      //   // DESCRIPTION UPDATE - BEGIN
      //   //
      //   // DESCRIPTION UPDATE - END
      //   if (value.description !== text) {
      //     value.eagleUpdate = true;
      //   }
      // }
      //
      if (!value.eagleId || !value.eagleUpdate) {
        continue;
      }
      if (!eagleFolder) {
        eagle.init();
        eagleFolder = await eagle.updateFolder({ name: '.zengguanqiang.cn', parentName: '.import' });
      }
      await eagle.post('/api/item/update', {
        id: value.eagleId,
        name: value.eagleName,
        url: value.eagleUrl,
        annotation: JSON.stringify({
          title: value.filename,
          description: value.description,
          category: { id: categoryId, name: category.name, url: category.url },
        }),
      }).catch((e) => {
        console.log(`🛑 image updated fail | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}`);
        fs.appendFileSync(errorLog, `🛑 image updated fail | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
      });
      await utils.sleep(10);
      delete value.eagleUpdate;
      imageNumber += 1;
      console.log(`✅ [${String(imageNumber).padStart(6, '0')}] image updated | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}`);
    }
    console.log(`✅ [${String(categoryNumber).padStart(4, '0')}] category updated | ${categoryId} | ${category.title}`);
  }
  console.log(`✅ finish updated ${imageNumber} image(s) in ${categoryNumber} category(s)`);
  clearInterval(timer);
  // write
  fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  //
  console.log(`Data is stored to "[${json}]".`);
};

main().then(() => {
  process.exit(0);
}).catch((err) => {
  throw err;
});
