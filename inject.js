function init(summonOnly, beQuiet) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  let observer = null;
  let messageList = null;
  let lastMessage = null;
  let lastSpokenIndex = 0;
  function speakFromQueue() {
    const totalText = lastMessage.textContent.trim();
    if (speechSynthesis.speaking) return console.log('Already speaking');

    const unspokenText = totalText.slice(lastSpokenIndex);
    const textToSpeak = unspokenText.slice(0, 200).replace(/\w+$/, '');
    console.log({ totalText, lastSpokenIndex, unspokenText, textToSpeak });
    if (!textToSpeak) return;

    console.log('Speaking', `"${textToSpeak}"`);
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = function () {
      console.log('Finished speaking', `"${textToSpeak}"`);
      lastSpokenIndex += textToSpeak.length;
      speakFromQueue();
    };
    speechSynthesis.speak(utterance);
  }

  function stopTalking() {
    console.log('Stopping Talking');
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    lastSpokenIndex = Infinity;
  }
  async function speakNewText() {
    const latestMessage = messageList.lastElementChild.previousElementSibling;
    if (latestMessage === messageList.firstElementChild) return;
    if (lastMessage !== latestMessage) {
      lastMessage = latestMessage;
      stopTalking();
      lastSpokenIndex = 0;
    }

    setTimeout(speakFromQueue, 2500);
  }

  if (!beQuiet)
    setInterval(() => {
      let newMessageList = document.querySelectorAll('div[class^="react-scroll-to-bottom"]')[1].children[0];
      if (!newMessageList || newMessageList === messageList) return;

      if (messageList) observer.disconnect();
      if (observer) observer.disconnect();

      messageList = newMessageList;
      observer = new MutationObserver(speakNewText);
      observer.observe(newMessageList, { childList: true, subtree: true });
      speakNewText();
    }, 1000);

  let inputElement = null;
  const inputListener = event => {
    if (!event.inputType) return;

    finalTranscript = inputElement.value;
  };
  setInterval(() => {
    const newInputElement = document.querySelector('textarea[data-id]');
    if (!newInputElement || newInputElement === inputElement) return;
    if (inputElement) inputElement.removeEventListener('input', inputListener);
    newInputElement.addEventListener('input', inputListener);
    inputElement = newInputElement;
    finalTranscript = '';
  }, 1000);
  const recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalTranscript = '';
  const COMMANDS = new Map(
    [
      [
        /thanks GPT$/i,
        async function (cmd) {
          this.removeCMD(cmd);
          inputElement.nextElementSibling.click();
          await delay(1000);
          this.updateValue('');
        },
      ],
      [
        /goodbye GPT$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue('');
          window.r2StopRecognition();
        },
      ],
      [
        /be quiet GPT$/i,
        function (cmd) {
          this.removeCMD(cmd);
          stopTalking();
        },
      ],
      [
        /stop GPT$/i,
        function (cmd) {
          this.removeCMD(cmd);
          const stopButton = document.evaluate(
            "//button[contains(., 'Stop generating')]",
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue;
          if (stopButton) stopButton.click();

          const mobileStopButton = inputElement.parentElement.nextElementSibling.querySelector('button');
          if (mobileStopButton) mobileStopButton.click();
        },
      ],
      [
        /backspace$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => {
            const lastWord = value.split(/\s+/).at(-1);
            return value.slice(0, -lastWord.length).trim();
          });
        },
      ],
      [
        /clear$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue('');
        },
      ],
      [
        /comma$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + ', ');
        },
      ],
      [
        /question mark$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + '? ');
        },
      ],
      [
        /exclamation point$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + '! ');
        },
      ],
      [
        /exclamation mark$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + '! ');
        },
      ],
      [
        /new line$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + '\n\n');
        },
      ],
      [
        /dot$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + '. ');
        },
      ],
      [
        /period$/i,
        function (cmd) {
          this.removeCMD(cmd);
          this.updateValue(value => value + '. ');
        },
      ],
    ].map(([key, func]) => [
      key,
      func.bind({
        updateValue: value => {
          if (typeof value === 'function') value = value(inputElement.value);
          inputElement.value = value;
          finalTranscript = value;
        },
        removeCMD: cmd => {
          inputElement.value = inputElement.value.trim().replace(cmd, '').replace(/ +$/, '');
          finalTranscript = inputElement.value;
        },
      }),
    ]),
  );
  async function processCommands() {
    const cleanFinalTranscript = finalTranscript.trim();
    for (const [key, func] of COMMANDS) {
      if (cleanFinalTranscript.match(key)) {
        await func(key);
        break;
      }
    }
  }

  recognition.addEventListener('end', () => {
    if (window.r2IsUsing && !summonOnly) recognition.start();
  });

  recognition.addEventListener('error', console.error);

  recognition.addEventListener('result', async function (event) {
    if (!inputElement) return;

    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }
    inputElement.value = finalTranscript + interimTranscript;
    await processCommands();

    const newEvent = new InputEvent('input', { bubbles: true });
    inputElement.dispatchEvent(newEvent);
  });

  window.r2StopRecognition = () => {
    window.r2IsUsing = false;
    console.log('Stopping recognition');
    recognition.stop();
  };

  window.r2StartRecognition = () => {
    console.log('Starting recognition');
    window.r2IsUsing = true;
    recognition.start();
  };

  window.r2IsUsing = false;
}

function startRecognition() {
  return window.r2StartRecognition();
}

function isUsing() {
  return window.r2IsUsing;
}

module.exports = { init, startRecognition, isUsing };
