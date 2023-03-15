require('dotenv').config();
const fs = require('fs');
const { Porcupine, BuiltinKeyword } = require('@picovoice/porcupine-node');
const PvRecorder = require('@picovoice/pvrecorder-node');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Page, Browser } = require('puppeteer');
const client = require('./inject');
puppeteer.use(StealthPlugin());

const accessKey = process.env.ACCESS_KEY;

const KEYWORDS = (process.env.KEYWORDS?.split(',') ?? process.argv.find(arg => arg.startsWith('--keywords'))?.split('--keywords=')[1]?.split(',')).filter(Boolean);
const KEYWORD_PATHS = (process.env.KEYWORD_PATHS?.split(',') ?? process.argv.find(arg => arg.startsWith('--keyword-paths'))?.split('--keyword-paths=')[1]?.split(',')).filter(Boolean);
const AUDIO_DEVICE_NAME = process.env.AUDIO_DEVICE_NAME ?? process.argv.find(arg => arg.startsWith('--audio-device-name'))?.split('--audio-device-name=')[1];

async function waitForWake(keywords, keywordPaths) {
  const porcupineKeywords = [];
  for (const keyword of keywords) {
    if (!BuiltinKeyword[keyword]) throw new Error(`Invalid keyword: ${keyword}`);

    porcupineKeywords.push(BuiltinKeyword[keyword]);
  }
  for (const path of keywordPaths) {
    if (!fs.existsSync(path)) throw new Error(`Invalid keyword path: ${path}`);

    porcupineKeywords.push(path);
  }
  if (!porcupineKeywords.length) {
    if (process.platform === 'linux') porcupineKeywords.push('./ppns/Hey-Chat-G-P-T_en_linux_v2_1_0.ppn');
    else porcupineKeywords.push(BuiltinKeyword.COMPUTER);
  }
  const sensitivities = new Array(porcupineKeywords.length).fill(0.5);
  const handle = new Porcupine(accessKey, porcupineKeywords, sensitivities);
  const frameLength = handle.frameLength;


  let audioDeviceIndex = PvRecorder.PvRecorder.getAudioDevices().indexOf(AUDIO_DEVICE_NAME);
  if (audioDeviceIndex === -1) process.stdout.write('Waiting for audio device');
  while (audioDeviceIndex === -1) {
    await delay(1000);
    audioDeviceIndex = PvRecorder.PvRecorder.getAudioDevices().indexOf(AUDIO_DEVICE_NAME);
    process.stdout.write('.');
  }


  const recorder = new PvRecorder.PvRecorder(audioDeviceIndex, frameLength);
  recorder.start();
  console.log('Waiting for wake word');

  while (true) {
    try {
      const pcm = await recorder.read();
      let index = handle.process(pcm);
      if (index === -1) continue;
      recorder.release();
      handle.release();
      console.log('Woke up');
      return;
    } catch (e) {
      console.error(e);
      return waitForWake(keywords, keywordPaths);
    }
  }
}

/**	@type {Browser} */
let browser = null;
/** @type {Page} */
let page = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const NOOP = () => undefined;

const USERNAME = process.env.CHAT_GPT_USERNAME;
const PASSWORD = process.env.CHAT_GPT_PASSWORD;

async function openUpChatGPT(summonOnly, beQuiet) {
  if (!browser) {
    console.log('Launching browser');
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/usr/bin/google-chrome-stable',
      userDataDir: './user-data',
    });
    const context = browser.defaultBrowserContext();
    context.overridePermissions('https://chat.openai.com/', ['microphone']);
    page = (await context.pages())[0];
    await page.goto('https://chat.openai.com/chat');
    await delay(2000);
    // get a button with the text "Verify you are human"
    const [verifyButton] = await page.$x("//button[contains(., 'Verify you are human')]");
    if (verifyButton) {
      console.log('Clicking verify button');
      await verifyButton.click();
    }
    const [loginButton] = await page.$x("//button[contains(., 'Log in')]");
    if (loginButton) {
      console.log('Clicking login button');
      await loginButton.click();
      await delay(5000);
      const usernameInput = await page.$('input[name="username"]');
      if (usernameInput) {
        console.log('Typing username');
        await usernameInput.type(USERNAME);
        // click button with type of submit
        await page.click("button[type='submit']");
        await delay(5000);
      }
      console.log('Typing password');
      await page.type('input[name="password"]', PASSWORD);
      await page.click("button[type='submit']");
      await delay(5000);
    }

    console.log('Injecting speech recognition');
    await page.evaluate(client.init, summonOnly, beQuiet);
  } else {
    const session = await page.target().createCDPSession();
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await session.detach();
  }

  while (true) {
    await delay(2500);
    console.log('Waiting for dialog');
    const dialog = await page.$('div[role="dialog"]');
    if (!dialog) break;
    const [nextButton] = await page.$x("//button[contains(., 'Next')]");
    const [doneButton] = await page.$x("//button[contains(., 'Done')]");
    const anyButton = nextButton || doneButton;
    if (anyButton) {
      await anyButton.click();
    } else {
      console.log('No Next/Done button');
      await delay(10000);
    }
  }

  await page.waitForSelector('textarea[data-id]');
}

async function typeIntoChatGPT(summonOnly, beQuiet) {
  await openUpChatGPT(summonOnly, beQuiet);
  if (!summonOnly) await page.evaluate(client.startRecognition);
  console.log('Listening for speech');
  while (true) {
    await delay(1000);
    const isStillUsing = await page.evaluate(client.isUsing);
    if (!isStillUsing) break;
  }
  const session = await page.target().createCDPSession();
  const { windowId } = await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  await session.detach();

  console.log('Done listening for speech');
}

async function main(summonOnly, beQuiet) {
  if (!AUDIO_DEVICE_NAME) {
    console.error('No audio device name specified');
    console.log(PvRecorder.PvRecorder.getAudioDevices());
    return;
  }
  while (true) {
    await waitForWake(KEYWORDS, KEYWORD_PATHS);
    await typeIntoChatGPT(summonOnly, beQuiet);
  }
}
main(process.argv.includes('--summon-only'), process.argv.includes('--be-quiet')).catch(console.error);
