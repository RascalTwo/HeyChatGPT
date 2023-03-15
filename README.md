# HeyChatGPT

Allows users to summon and control Chat GPT with their voice!

## Usage

First install the dependencies via the `npm install` command.

Then obtain a free Porcupine AccessKey from https://console.picovoice.ai/, and add it as the `ACCESS_KEY` environment variable in a `.env` file in the root of the project.

On the first `npm start` run, you will have to manually login to Chat GPT, but additional runs will use the same session.

> This does mean that if you don't use HeyChatGPT for a while, you might have to login again.

### UI

When you've been taken to the ChatGPT site, there are various Voice commands you can use to interact with the page:

- Thanks GPT
  - Sends the currently typed out message
- Goodbye GPT
  - Minimizes the ChatGPT window and stops listening for commands
- Be Quiet GPT
  - Stops the current text-to-speech
- Stop GPT
  - Stops the generation of the current response

Additionally there are various commands added to make crafting messages easier:

- Backspace
  - Remove the latest word
- Clear
  - Clears the text
- Comma
  - Adds a comma
- Dot/Period
  - Adds a period
- Question Mark
  - Adds a question mark
- Exclamation Mark/Point
  - Adds an exclamation point
- New Line
  - Adds a new line

### Customization

If you wish to only use HeyChatGPT to summon Chat GPT, you can pass the `--summon-only` flag via `npm run start -- --summon-only` command.

Additionally you can disable the text-to-speech via the `--be-quiet` flag via `npm run start -- --be-quiet` command.

---

The Wake word is currently set to "Hey Chat GPT", but is specifically trained on my voice, which will have mixed results for other voices.

Thankfully one can train their own wake word using the Porcupine Console, and then use the `--keyword-paths` flag to specify the path(s) to the `.ppn` file - separated by comma if you wish to use multiple.

If you're fine with one of the builtin wake words, you can use the `--keywords` flag to specify as many wake words - separated with commas - as you wish, which can be one of the following:

- `ALEXA`
- `AMERICANO`
- `BLUEBERRY`
- `BUMBLEBEE`
- `COMPUTER`
- `GRAPEFRUIT`
- `GRASSHOPPER`
- `HEY_GOOGLE`
- `HEY_SIRI`
- `JARVIS`
- `OK_GOOGLE`
- `PICOVOICE`
- `PORCUPINE`
- `TERMINATOR`

> If you use the `--keywords` flag, you will have to explicitly specify the `--keyword-paths` flag if you wish to use both.

---

Both of these are additionally customizable via environment variables, with the `KEYWORDS` and `KEYWORD_PATHS` environment variables respectively.

---

The first time you run HeyChatGPT, it will ask you which input device to use for input, and will remember your choice for future runs by saving it to the `.env` file.

This can be changed at a later date by deleting the `AUDIO_INPUT_DEVICE` environment variable from the `.env` file.

## How It's Made

**Tech used:** JavaScript, Porcupine, Chrome, Web Speech API, Puppeteer

Porcupine is used to detect the wake word, then ChatGPT is opened in Chrome, and finally a userscript is injected into the page using the Web Speech API to allow the user to enter and interact with Chat GPT using their voice.

> Currently the Web Speech API is only supported in Chrome, at the cost of the audio being sent to Google's servers for processing.

## Optimizations

Improvements to the voice command UI are planned, giving the users the ability to customize the commands, along with additional commands to switch between conversations and such.

Additionally a visual UI is planned to allow users to see the current state of HeyChatGPT, allowing them to interact with the new features without their voice.
