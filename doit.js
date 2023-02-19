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

//const handle = new Porcupine(accessKey, ['./Hey-Chat-G-P-T_en_linux_v2_1_0.ppn', BuiltinKeyword.COMPUTER], [0.5, 0.5]);

/*
async function recordAudio() {
  const frameLength = handle.frameLength;
  const audioDeviceIndex = -1;
  let recording = false;
  const recorder = new PvRecorder.PvRecorder(audioDeviceIndex, frameLength);
  recorder.start();
  const stream = fs.createWriteStream('test.pcm', { flags: 'w' });
  // Storing at 16Khz, 16bit, mono

  while (true) {
    const pcm = await recorder.read();
    if (recording) {
      stream.write(Buffer.from(pcm.buffer));
    }
    let index = handle.process(pcm);
    if (index === -1) continue;

    if (index == 0) {
      console.log('Started');
      recording = true;
    } else {
      console.log('Stopped');
      recording = false;
      stream.close();
      recorder.release();
      return;
    }
  }
}
*/
async function waitForWake() {
  const handle = new Porcupine(accessKey, ['./Hey-Chat-G-P-T_en_linux_v2_1_0.ppn'], [0.5]);

  const frameLength = handle.frameLength;
  const audioDeviceIndex = -1;
  const recorder = new PvRecorder.PvRecorder(audioDeviceIndex, frameLength);
  recorder.start();

  while (true) {
    const pcm = await recorder.read();
    let index = handle.process(pcm);
    if (index === -1) continue;
    recorder.release();
    handle.release();
    console.log('Woke up');
    return;
  }
}

async function pcmToWav() {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec('ffmpeg -f s16le -ar 16k -ac 1 -i test.pcm test.wav -y', (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function startProcessing() {
  const { exec } = require('child_process');
  exec(
    'deepspeech --model deepspeech-0.9.3-models.pbmm --scorer deepspeech-0.9.3-models.scorer --audio test.wav --json',
    (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        return;
      }

      // the *entire* stdout and stderr (buffered)
      console.log(`stdout: ${stdout}`);
      try {
        const data = JSON.parse(stdout);
        const sentence = data.transcripts[0].words.map(w => w.word).join(' ');
        console.log(sentence);
      } catch (e) {
        console.log(stdout);
      }
    },
  );
}

/**	@type {Browser} */
let browser = null;
/** @type {Page} */
let page = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const NOOP = () => undefined;

const USERNAME = process.env.CHAT_GPT_USERNAME;
const PASSWORD = process.env.CHAT_GPT_PASSWORD;

async function openUpChatGPT() {
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
    await page.evaluate(client.init);
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

async function typeIntoChatGPT() {
  await openUpChatGPT();
  await page.evaluate(client.startRecognition);
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

async function main() {
  while (true) {
    await waitForWake();
    //await pcmToWav();
    //await startProcessing();
    await typeIntoChatGPT();
  }
}
main().catch(console.error);
