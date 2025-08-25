import * as fs from 'node:fs';
import * as path from 'node:path';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
import * as cheerio from 'cheerio';
//
import * as setting from './setting.js';
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
  // read
  const json = `${allConfig.runtime.wkdir}${path.sep}data.zgq.json`;
  const log = `${allConfig.runtime.wkdir}${path.sep}log.scrape.zgq.txt`;
  fs.writeFileSync(log, '', { encoding: 'utf-8' });
  const errorLog = `${allConfig.runtime.wkdir}${path.sep}log.error.scrape.zgq.txt`;
  fs.writeFileSync(errorLog, '', { encoding: 'utf-8' });
  let data;
  try {
    data = JSON.parse(fs.readFileSync(json, { encoding: 'utf-8' }));
    console.log(`Data is loaded from "[${json}]".`);
  } catch (_) {
    data = {};
  }
  // 1st category
  const host = 'http://gqz.duckdns.org:8886';
  data[0] || (data[0] = { title: '主页', url: host });
  //
  let html = await utils.getHtmlByFetch({ url: host });
  let $ = cheerio.load(html);
  let temp = $('ul.category-list a');
  for (let i = 0; i < temp.length; i++) {
    const aEl = temp.eq(i);
    const url = aEl.attr('href');
    const title = aEl.attr('title');
    const categoryId = parseInt(/\/cid\/([0-9]+).html/.exec(url)[1]);
    if (data[categoryId]) {
      // console.log(`☑️ category collected | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}`);
      // fs.appendFileSync(log, `☑️ category collected | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}\n`, { encoding: 'utf-8' });
      continue;
    }
    data[0].subCategoryList || (data[0].subCategoryList = []);
    if (!data[0].subCategoryList.includes(categoryId)) {
      data[0].subCategoryList.push(categoryId);
    }
    //
    data[categoryId] = { title, url: `${host}/search/index.html?cid=${categoryId}&page_size=500` };
    console.log(`✅ category fetched | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}`);
    fs.appendFileSync(log, `✅ category fetched | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}\n`, { encoding: 'utf-8' });
  }
  // 2st category
  temp = Object.keys(data);
  for (let i = 0; i < temp.length; i++) {
    const categoryId = temp[i];
    if (categoryId === '0') {
      continue;
    }
    const value = data[categoryId];
    html = await utils.getHtmlByFetch({ url: `${host}/category/index/cid/${categoryId}.html` });
    $ = cheerio.load(html);
    const t = $('ul.category-nav a');
    for (let i = 1; i < t.length; i++) {
      const aEl = t.eq(i);
      const url = aEl.attr('href');
      const title = aEl.attr('title');
      const categoryId = parseInt(/\/cid\/([0-9]+).html/.exec(url)[1]);
      //
      value.subCategoryList || (value.subCategoryList = []);
      if (!value.subCategoryList.includes(categoryId)) {
        value.subCategoryList.push(categoryId);
      }
      //
      if (data[categoryId]) {
        // console.log(`☑️ category collected | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}`);
        // fs.appendFileSync(log, `☑️ category collected | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}\n`, { encoding: 'utf-8' });
        continue;
      }
      data[categoryId] = { title, url: `${host}/search/index.html?cid=${categoryId}&page_size=500`, nextCount: 1 };
      console.log(`✅ category fetched | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}`);
      fs.appendFileSync(log, `✅ category fetched | ${categoryId} | ${JSON.stringify({ ...data[categoryId], imageMap: undefined })}\n`, { encoding: 'utf-8' });
    }
  }
  // image
  const imageMap = {};
  const handleCategory = async (category) => {
    if (check.array(category.subCategoryList)) {
      for (let i = 0; i < category.subCategoryList.length; i++) {
        await handleCategory(data[category.subCategoryList[i]]);
      }
    } else {
      let html = await utils.getHtmlByFetch({ url: category.url });
      let $ = cheerio.load(html);
      const totalPage = allConfig.scrape.updateMode ? 1 : parseInt(/([0-9]+)/.exec($('ul.am-pagination:last div:last-child span:last-child').text())[1]);
      for (let j = totalPage; j >= 1; j--) {
        const url = `${category.url}&page=${j}`;
        html = await utils.getHtmlByFetch({ url });
        $ = cheerio.load(html);
        const imgList = $('ul.search-list img.goods-images');
        for (let i = imgList.length - 1; i >= 0; i--) {
          const aEl = imgList.eq(i);
          const src = encodeURI(aEl.attr('src'));
          category.imageMap || (category.imageMap = {});
          if (category.imageMap[src] || imageMap[src]) {
            // console.log(`☑️ image collected | ${src} | ${JSON.stringify(category.imageMap[src])}`);
            // fs.appendFileSync(log, `☑️ image collected | ${src} | ${JSON.stringify(category.imageMap[src])}\n`, { encoding: 'utf-8' });
            continue;
          }
          category.imageMap[src] = { count: category.nextCount };
          category.nextCount += 1;
          imageMap[src] = true;
          console.log(`✅ image fetched | ${src} | ${JSON.stringify(category.imageMap[src])}`);
          fs.appendFileSync(log, `✅ image fetched | ${src} | ${JSON.stringify(category.imageMap[src])}\n`, { encoding: 'utf-8' });
        }
        console.log(`✅ page fetched | ${String(j).padStart(2, '0')} of ${String(totalPage).padStart(2, '0')} | ${category.title}`);
        fs.appendFileSync(log, `✅ page fetched | ${String(j).padStart(2, '0')} of ${String(totalPage).padStart(2, '0')} | ${category.title}\n`, { encoding: 'utf-8' });
      }
    }
  };
  await handleCategory(data[0]);
  console.log(`✅ finish get info of ${Object.keys(imageMap).length} image(s) in ${Object.keys(data).length - 1} category(s)${allConfig.scrape.updateMode ? ' in (update mode)' : ''}`);
  fs.appendFileSync(log, `✅ finish get info of ${Object.keys(imageMap).length} image(s) in ${Object.keys(data).length - 1} category(s)${allConfig.scrape.updateMode ? ' in (update mode)' : ''}\n`, { encoding: 'utf-8' });
  // write
  fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  console.log(`Data is stored to "[${json}]".`);
};

main().then(() => {
  process.exit(0);
}).catch((err) => {
  throw err;
});
