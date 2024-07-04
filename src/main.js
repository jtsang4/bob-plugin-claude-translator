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
 * "anthropic-beta": string;
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
 * @returns {string}
 */

function generatePrompts(query) {
  const sourceLanguage = lang.langMap.get(query.detectFrom) || query.detectFrom;
  const targetLanguage = lang.langMap.get(query.detectTo) || query.detectTo;

  return `Translate from ${sourceLanguage} to ${targetLanguage}. Preserve meaning and style. Do not add or remove information. Only output the translation:

${query.text}`;
}

/**
 * @param {string} model
 * @param {Bob.TranslateQuery} query
 * @returns {{
 * model: string;
 * messages: {role: string; content: string}[];
 * max_tokens: number;
 * stream: boolean;
 * }}
 */
function buildRequestBody(model, query) {
  const prompt = generatePrompts(query);
  const systemMessage = "You are a translator. Your task is to accurately translate the given text while preserving its original meaning, tone, and style. Respond only with the translated text. Do not add any explanations, introductions, or other text.";
  
  $log.info(prompt);
  return {
    model,
    system: systemMessage,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
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
  if (!lang.langMap.get(query.detectTo)) {
    query.onCompletion({
      error: {
        type: 'unsupportLanguage',
        message: '不支持该语种',
        addtion: '不支持该语种',
      },
    });
  }

  const { model, apiKeys = '', apiUrl = 'https://api.anthropic.com' } = $option;
  const apiKeySelection = apiKeys.split(',').map((key) => key.trim());

  if (!apiKeySelection.length) {
    query.onCompletion({
      error: {
        type: 'secretKey',
        message: '配置错误 - 未填写 API Keys',
        addtion: '请在插件配置中填写 API Keys',
      },
    });
  }

  const apiKey =
    apiKeySelection[Math.floor(Math.random() * apiKeySelection.length)];
  const apiUrlPath = '/v1/messages';
  const header = buildHeader(apiKey);
  const body = buildRequestBody(model, query);

  (async () => {
    let targetText = '';

    await $http.streamRequest({
      method: 'POST',
      url: apiUrl + apiUrlPath,
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