//@ts-check

var lang = require('./lang.js');

function supportLanguages() {
  return lang.supportLanguages.map(([standardLang]) => standardLang);
}

/**
 * @param {string} apiKey - The authentication API key.
 * @returns {{
 * "Accept": string;
 * "Content-Type": string;
 * "x-api-key": string;
 * "anthropic-version": string;
 * }} The header object.
 */
function buildHeader(apiKey) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

/**
 * @param {Bob.TranslateQuery} query
 * @returns {{generatedSystemPrompt: string, generatedUserPrompt: string}}
 */
function generatePrompts (query)  {
 const SYSTEM_PROMPT = "You are an expert translator. Your task is to accurately translate the given text without altering its original meaning, tone, and style. Present only the translated result without any additional commentary.";

  let generatedSystemPrompt = null;
  const detectFrom =  query.detectFrom
  const detectTo =  query.detectTo
  const sourceLang = lang.langMap.get(detectFrom) || detectFrom;
  const targetLang = lang.langMap.get(detectTo) || detectTo;
  let generatedUserPrompt = `Please translate below text from ${sourceLang} to ${targetLang}. Present only the translated result without any additional commentary`;

  if (detectTo === "wyw" || detectTo === "yue") generatedUserPrompt = `翻译成${targetLang}，只呈现翻译结果,不需要任何额外的评论`;
  if (detectFrom === "wyw" || detectFrom === "zh-Hans" || detectFrom === "zh-Hant") {
    if (detectTo === "zh-Hant") {
      generatedUserPrompt = "翻译成繁体白话文，只呈现翻译结果,不需要任何额外的评论";
    } else if (detectTo === "zh-Hans") {
      generatedUserPrompt = "翻译成简体白话文，只呈现翻译结果,不需要任何额外的评论";
    } else if (detectTo === "yue") generatedUserPrompt = "翻译成粤语白话文，只呈现翻译结果,不需要任何额外的评论";
  }

  if (detectFrom === detectTo) {
    generatedSystemPrompt = "You are an expert text embellisher. Your sole purpose is to enhance and elevate the given text without altering its core meaning or intent. Please refrain from interpreting or explaining the text. Just give me the result. Present only the refined result without any additional commentary.";
    if (detectTo === "zh-Hant" || detectTo === "zh-Hans") {
      generatedUserPrompt = "润色此句，只呈现翻译结果,不需要任何额外的评论";
    } else {
      generatedUserPrompt = "polish this sentence. Present only the refined result without any additional commentary:";
    }
  }

  generatedUserPrompt = `${generatedUserPrompt}:\n\n${query.text}`

  return {
    generatedSystemPrompt: generatedSystemPrompt ?? SYSTEM_PROMPT,
    generatedUserPrompt
  };
}



/**
 * @param {string} model
 * @param {Bob.TranslateQuery} query
 * @returns {{
 * model: string;
 * messages: {role: string; content: string}[];
 * system: string;
 * temperature: number;
 * max_tokens: number;
 * stream: boolean;
 * }}
 */
function buildRequestBody(model, query) {
  const {generatedSystemPrompt, generatedUserPrompt} = generatePrompts(query);

  // prompt
  const replacePromptKeywords = (/** @type {string} */ prompt, /** @type {Bob.TranslateQuery} */ query) => {
      if (!prompt) return prompt;
      return prompt.replace("$text", query.text)
          .replace("$sourceLang", query.detectFrom)
          .replace("$targetLang", query.detectTo);
  }
  const customSystemPrompt = replacePromptKeywords($option.customSystemPrompt, query);
  const customUserPrompt = replacePromptKeywords($option.customUserPrompt, query);
  const systemPrompt = customSystemPrompt || generatedSystemPrompt;
  const userPrompt = customUserPrompt || generatedUserPrompt;

  $log.info(`System Prompt:${systemPrompt}\nUser Prompt:${userPrompt}`);

  return {
    model: model,
    messages: [{role: 'user', content: userPrompt}],
    system: systemPrompt,
    temperature: Number($option.temperature ?? 0.7),
    max_tokens: 4096,
    stream: true,
  };
}

/**
 * @param {Bob.TranslateQuery} query
 * @param {Bob.HttpResponse} result
 * @returns {void}
 */
function handleError(query, result) {
  const { statusCode } = result.response;
  const reason = statusCode >= 400 && statusCode < 500 ? 'param' : 'api';
  const errorMessage =
    result.data && result.data.detail ? result.data.detail : '接口响应错误';

  // Enhanced error logging
  $log.error(`Translation error: ${errorMessage}. Status code: ${statusCode}. Full response: ${JSON.stringify(result)}`);

  query.onCompletion({
    error: {
      type: reason,
      message: `${errorMessage}`,
      addtion: JSON.stringify(result),
    },
  });
}

/**
 * 解析流事件数据并根据事件类型进行处理
 * @param {string} line 从流中接收到的一行数据
 */
function parseStreamData(line) {
  // 解析事件类型
  const eventTypeMatch = line.match(/^event:\s*(.*)$/);
  if (eventTypeMatch) {
    return { eventType: eventTypeMatch[1] };
  }
  // 解析数据内容
  const dataMatch = line.match(/^data:\s*(.*)$/);
  if (dataMatch) {
    const data = JSON.parse(dataMatch[1]);
    return { data };
  }
  return null;
}

/**
 * @param {Bob.TranslateQuery} query
 * @param {string} targetText
 * @param {string} responseObj
 * @returns {string}
 */
function handleResponse(query, targetText, responseObj) {
  let resultText = targetText;

  try {
    // @ts-ignore
    const { type, delta, index } = responseObj;

    // 根据事件类型处理逻辑
    switch (type) {
      case 'content_block_start':
        // 如有必要，处理 content_block_start 事件
        break;
      case 'content_block_delta':
        // 处理文本变化
        if (delta && delta.type === 'text_delta') {
          resultText += delta.text;
        }
        query.onStream({
          result: {
            from: query.detectFrom,
            to: query.detectTo,
            toParagraphs: [resultText],
          },
        });
        break;
      case 'content_block_stop':
        // 如有必要，处理 content_block_stop 事件
        break;
      case 'message_start':
        // 如有必要，处理 message_start 事件
        break;
      case 'message_delta':
        // 可以在此处理停止原因等 message_delta 信息
        break;
      case 'message_stop':
        // 当消息流停止时，完成处理
        query.onCompletion({
          result: {
            from: query.detectFrom,
            to: query.detectTo,
            toParagraphs: [resultText],
          },
        });
        break;
      default:
        // 对无法识别的事件类型不做处理
        break;
    }
    return resultText;
  } catch (err) {
    // 错误处理
    query.onCompletion({
      error: {
        type: err._type || 'param',
        message: err.message || 'JSON 解析错误',
        // @ts-ignore
        addition: err._addition,
      },
    });
    return resultText;
  }
}

/**
 * @type {Bob.Translate}
 */
function translate(query) {
  // Input validation
  if (!query || typeof query !== 'object') {
    return query.onCompletion({
      error: {
        type: 'param',
        message: 'Invalid query object',
        addtion: 'Query must be a valid object',
      },
    });
  }

  if (!query.text || typeof query.text !== 'string' || query.text.trim() === '') {
    return query.onCompletion({
      error: {
        type: 'param',
        message: 'Invalid input text',
        addtion: 'Input text must be a non-empty string',
      },
    });
  }

  if (!lang.langMap.get(query.detectTo)) {
      return query.onCompletion({
          error: {
              type: 'unsupportLanguage',
              message: '不支持该语种',
              addtion: '不支持该语种',
          },
      });
  }

  const {model, apiKeys, apiUrl, apiUrlPath} = $option;
  const apiKeySelection = apiKeys.split(',').map((key) => key.trim());

  if (!apiKeySelection.length) {
      return query.onCompletion({
          error: {
              type: 'secretKey',
              message: '配置错误 - 未填写 API Keys',
              addtion: '请在插件配置中填写 API Keys',
          },
      });
  }


  const apiKey =
    apiKeySelection[Math.floor(Math.random() * apiKeySelection.length)];

  const baseUrl = apiUrl || "https://api.anthropic.com";
  const urlPath = apiUrlPath || "/v1/messages";

  const header = buildHeader(apiKey);
  const body = buildRequestBody(model, query);

  (async () => {
    let targetText = '';

    await $http.streamRequest({
      method: 'POST',
      url: baseUrl + urlPath,
      header,
      body,
      cancelSignal: query.cancelSignal,
      streamHandler: (streamData) => {
        const lines = streamData.text.split('\n');
        for (const line of lines) {
          const parsedData = parseStreamData(line);
          if (!parsedData) continue; // 如果解析不到数据则跳过

          if (parsedData.eventType) {
            // 根据事件类型做一些操作，例如记录日志等
            $log.info(`Received event: ${parsedData.eventType}`);
          } else if (parsedData.data) {
            // 这里调用 handleResponse 或其他函数处理具体数据
            targetText = handleResponse(query, targetText, parsedData.data);
          }
        }
      },
      handler: (result) => {
        if (result.error || result.response.statusCode >= 400) {
          handleError(query, result);
        }
      },
    });
  })().catch((err) => {
    query.onCompletion({
      error: {
        type: err._type || 'unknown',
        message: err._message || '未知错误',
        addtion: err._addition,
      },
    });
  });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;