import fs from 'node:fs';
import path from 'node:path';
//
import check from 'check-types';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import randomUseragent from 'random-useragent';
//
import * as eagle from './eagle.js';
import * as setting from './setting.js';

const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

let allConfig = null;

const createEagleFolder = async ({ parentName, name, summary, mediaCount, source, url }) => {
  if (check.not.string(parentName) || check.emptyString(parentName)) {
    throw Error('utils | createEagleFolder | parameter "parentName" should be non-empty "string"');
  }
  if (check.not.string(name) || check.emptyString(name)) {
    throw Error('utils | createEagleFolder | parameter "name" should be non-empty "string"');
  }
  //
  const description = {};
  if (check.string(summary) && check.not.emptyString(summary)) {
    description.summary = summary;
  }
  if (check.number(mediaCount)) {
    description.mediaCount = mediaCount;
  }
  if (check.string(source) && check.not.emptyString(source)) {
    description.source = source;
  }
  if (check.string(url) && urlRegex.test(url)) {
    description.url = url;
  }
  //
  await eagle.updateFolder({ name: '.import' });
  await eagle.updateFolder({ name: parentName, parentName: '.import' });
  return await eagle.updateFolder({
    name,
    parentName,
    description: Object.keys(description).length > 0 ? JSON.stringify(description) : undefined,
  });
};

const formatDateTime = (input, style) => {
  // format as 'yyyyMMdd_HHmmss_SSS'
  if (check.not.number(style)) {
    style = 0;
  }
  let dateTime;
  if (check.number(input) || check.string(input)) {
    dateTime = new Date(input);
  } else if (input instanceof Date) {
    dateTime = input;
  } else {
    dateTime = new Date();
  }
  const year = String(dateTime.getUTCFullYear()).padStart(4, 0);
  const month = String(dateTime.getUTCMonth() + 1).padStart(2, 0);
  const day = String(dateTime.getUTCDate()).padStart(2, 0);
  const hour = String(dateTime.getUTCHours()).padStart(2, 0);
  const minute = String(dateTime.getMinutes()).padStart(2, 0);
  const second = String(dateTime.getSeconds()).padStart(2, 0);
  const milliSecond = String(dateTime.getMilliseconds()).padStart(3, 0);
  if (style === 0) {
    return `${year}${month}${day}_${hour}${minute}${second}_${milliSecond}`;
  }
  return dateTime.toString();
};

const getHtmlByFetch = ({ url, fetchOption = {}, randomUserAgent = true }) => {
  // setting
  if (!allConfig) {
    allConfig = setting.get();
  }
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtml | parameter "url" should be "string" of valid url');
  }
  if (check.not.boolean(randomUserAgent)) {
    throw Error('utils | getHtml | parameter "randomUserAgent" should be "bool"');
  }
  // fetch option
  if (check.not.object(fetchOption)) {
    fetchOption = {};
  }
  if (check.not.object(fetchOption.headers)) {
    fetchOption.headers = {};
  }
  if (randomUserAgent) {
    fetchOption.headers['User-Agent'] = getRandomUsarAgent();
  }
  // other option
  if (check.string(allConfig.browser.fetch.proxy) && urlRegex.exec(allConfig.browser.fetch.proxy)) {
    let proxyAgent;
    try {
      proxyAgent = new HttpsProxyAgent(allConfig.browser.fetch.proxy);
    } catch (error) {
      throw new Error(`utils | getHtml | fetch ${url} | proxy issue | proxy = ${allConfig.browser.fetch.proxy} | ${error.message}`);
    }
    fetchOption.agent = proxyAgent;
  }
  // fetch
  return Promise.race([
    fetch(url, fetchOption)
      .catch((error) => {
        throw new Error(`utils | getHtml | fetch ${url} | network issue | ${error.message}`);
      })
      .then((response) => {
        if (response.status <= 199 || response.status >= 400) {
          throw new Error(`utils | getHtml | fetch ${url} | incorrect http status code | response.status = ${response.status}`);
        }
        return response.text();
      }),
    sleep(allConfig.browser.fetch.timeoutMs)
      .then(() => {
        throw new Error(`utils | getHtml | fetch ${url} | network issue | timeout after ${allConfig.browser.fetch.timeoutMs} ms`);
      }),
  ]).then((html) => {
    // debug
    if (allConfig.browser.fetch.debug.enable) {
      const file = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.html`);
      console.log(`HTML content of "${url}" is saved to "${file}".`);
      fs.writeFileSync(file, JSON.stringify(html, null, 2));
    }
    //
    return html;
  });
};

const getRedirectByFetch = ({ url, fetchOption = {}, randomUserAgent = true }) => {
  // setting
  if (!allConfig) {
    allConfig = setting.get();
  }
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtml | parameter "url" should be "string" of valid url');
  }
  if (check.not.boolean(randomUserAgent)) {
    throw Error('utils | getHtml | parameter "randomUserAgent" should be "bool"');
  }
  // fetch option
  if (check.not.object(fetchOption)) {
    fetchOption = {};
  }
  if (check.not.object(fetchOption.headers)) {
    fetchOption.headers = {};
  }
  if (randomUserAgent) {
    fetchOption.headers['User-Agent'] = getRandomUsarAgent();
  }
  fetchOption.redirect = 'manual';
  // other option
  if (check.string(allConfig.browser.fetch.proxy) && urlRegex.exec(allConfig.browser.fetch.proxy)) {
    let proxyAgent;
    try {
      proxyAgent = new HttpsProxyAgent(allConfig.browser.fetch.proxy);
    } catch (error) {
      throw new Error(`utils | getRedirect | fetch ${url} | proxy issue | proxy = ${allConfig.browser.fetch.proxy} | ${error.message}`);
    }
    fetchOption.agent = proxyAgent;
  }
  // fetch
  return Promise.race([
    fetch(url, fetchOption)
      .catch((error) => {
        throw new Error(`utils | getRedirect | fetch ${url} | network issue | ${error.message}`);
      })
      .then((response) => {
        return response.headers.get('Location') || response.headers.get('location') || '';
      }),
    sleep(allConfig.browser.fetch.timeoutMs)
      .then(() => {
        throw new Error(`utils | getRedirect | fetch ${url} | network issue | timeout after ${allConfig.browser.fetch.timeoutMs} ms`);
      }),
  ]);
};

const getRandomUsarAgent = () => {
  return randomUseragent.getRandom((ua) => {
    const ualc = ua.userAgent.toLowerCase();
    return (
      (
        ualc.includes('firefox') ||
        ualc.includes('chrome') ||
        ualc.includes('edge') ||
        ualc.includes('safari')
      ) &&
      (
        ualc.includes('windows') ||
        ualc.includes('mac')
      ) &&
      !(
        ualc.includes('mobile') ||
        ualc.includes('arm') ||
        ualc.includes('linux') ||
        ualc.includes('firefox/29')
      )
    );
  });
};

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const ocrToDescription = ({ ocrText = '', filename = '' }) => {
  let text = ocrText;
  if (!text) {
    return '';
  }
  text = text.trim();
  text = text.replaceAll(/,/g, '.');
  text = text.replaceAll(/\.+/g, '.');
  text = text.replaceAll(/\s+/g, ' ');
  text = text.replace(/[.]?(asf)/, '#LOCATE#');
  text = text.replace(/[.]?(avi)/, '#LOCATE#');
  text = text.replace(/[.]?(m[pP][dg4é]|[\s]m[pP])/, '#LOCATE#');
  text = text.replace(/[.]?([wW][imnrvVwWy]{3}[wW]|[wW][imrwW][mnwW][wWvVy]|vV]im|[vV]i[vV]|[vV]i[wW]|[vV]iy|vV]mm|[vV]mn|[vV]m[vV]|[vV]m[wW]|[vV]my|[vV]rm|[vV]rn|[vV]r[vV]|[vV]r[wW]|wW]im|[wW]i[vV]|[wW]i[wW]|[wW]iy|[wW]mm|[wW]mn|[wW]m[vV]|[wW]m[wW]|[wW]my|[wW]rm|[wW]rn|[wW]r[vV]|[wW]r[wW]|[wW]iy|[wW]im)/, '#LOCATE#');

  text = text.replace(' - ', '#SPLIT#');
  text = text.replace(' -', '#SPLIT#');
  text = text.replace('- ', '#SPLIT#');
  text = text.replaceAll(/(#SPLIT#)+/g, '#SPLIT#');
  text = text.split('#SPLIT#');
  //
  let temp = text.find((t) => /#LOCATE#/.test(t));
  if (temp) {
    text = temp;
  } else {
    text = text[0];
  }
  text = text.split(/-*\s*文\s*件/)[0];
  text = text.replaceAll(/#LOCATE#.*/g, '');
  text = text.replace(/([wWvV]in|[wWvV]ry|m[wW]|m[vV]|my|[wW]m|[wW][vV]|[wW][wW]|[wW]y)$/, '');
  text = text.trim();
  //
  text = text.replaceAll(/名/g, ':');
  text = text.replaceAll(/称/g, ':');
  text = text.replaceAll(/：/g, ':');
  text = text.replace(/^[A-Z0-9$¥£%&§]+/, ':');
  text = text.replaceAll(/:/g, '');
  text = text.trim();
  //
  const chi = text.search(/[\u4E00-\u9FFF]/);
  if (chi >= 0) {
    text = text.split('');
    text.splice(chi, 0, '-');
    text = text.join('');
  }
  //
  text = text.replaceAll(/[^-_\s0-9A-Za-z\u4E00-\u9FFF（）]*/g, '');
  text = text.replace(/^-*/, '');
  text = text.replace(/-*$/, '');
  text = text.replaceAll(/-+/g, '-');
  text = text.replaceAll(/\s+/g, ' ');
  text = text.trim();
  //
  const fnc = filename.split('-')[0];
  const tl = text.split('-');
  if (tl[0] !== fnc) {
    tl[0] = fnc;
    if (tl.length > 1 && tl[1].toLocaleLowerCase() === tl[0].toLocaleLowerCase()) {
      tl.splice(1, 1);
    }
    text = tl.join('-');
  }
  if (text === fnc) {
    const c = /([0-9]+)/.exec(filename);
    if (c) {
      text = `${fnc}-${c[1]}`;
    }
  }
  return text;
};

export {
  urlRegex,
  createEagleFolder,
  getHtmlByFetch,
  getRedirectByFetch,
  formatDateTime,
  sleep,
  ocrToDescription,
};
