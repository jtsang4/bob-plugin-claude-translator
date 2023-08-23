//@ts-check

var lang = require("./lang.js");

function supportLanguages() {
    return lang.supportLanguages.map(([standardLang]) => standardLang);
}

/**
 * @param {string} apiKey - The authentication API key.
 * @returns {{
 *   "Accept": string;
 *   "Content-Type": string;
 *   "x-api-key": string;
 *   "anthropic-version": string;
 * }} The header object.
 */
function buildHeader(apiKey) {
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-01-01",
    };
}

/**
 * @param {Bob.TranslateQuery} query
 * @returns {string}
*/
function generatePrompts(query) {
    const translationPrefixPrompt = 'Please translate below text'
    let userPrompt = `${translationPrefixPrompt} from "${lang.langMap.get(query.detectFrom) || query.detectFrom}" to "${lang.langMap.get(query.detectTo) || query.detectTo}"`;

    if (query.detectTo === "wyw" || query.detectTo === "yue") {
        userPrompt = `${translationPrefixPrompt} to "${lang.langMap.get(query.detectTo) || query.detectTo}"`;
    }

    if (
        query.detectFrom === "wyw" ||
        query.detectFrom === "zh-Hans" ||
        query.detectFrom === "zh-Hant"
    ) {
        if (query.detectTo === "zh-Hant") {
            userPrompt = `${translationPrefixPrompt} to traditional Chinese`;
        } else if (query.detectTo === "zh-Hans") {
            userPrompt = `${translationPrefixPrompt} to simplified Chinese`;
        } else if (query.detectTo === "yue") {
            userPrompt = `${translationPrefixPrompt} to Cantonese`;
        }
    }
    if (query.detectFrom === query.detectTo) {
        userPrompt = `Polish the sentence in triple backticks to "${query.detectTo}"`;
    }

    userPrompt = `${userPrompt}:\n
\`\`\`
${query.text}
\`\`\`

Do not add any content or symbols that does not exist in the original text.
`

    return userPrompt;
}

/**
 * @param {string} model
 * @param {Bob.TranslateQuery} query
 * @returns {{ 
 *  model: string;
 *  prompt: string;
 *  max_tokens_to_sample: number;
 *  stop_sequences: string[]
 *  temperature: number;
 *  stream: boolean;
 * }}
*/
function buildRequestBody(model, query) {
    const prompt = generatePrompts(query);
    return {
        model,
        prompt: `\n\nHuman: ${prompt}\n\nAssistant: OK, this is the translation result: `,
        max_tokens_to_sample: 100000,
        stop_sequences: [
            "\n\nHuman:"
        ],
        temperature: 0.7,
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
    const reason = (statusCode >= 400 && statusCode < 500) ? "param" : "api";
    query.onCompletion({
        error: {
            type: reason,
            message: `接口响应错误 - ${result.data.detail}`,
            addtion: JSON.stringify(result),
        },
    });
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
        const currentResponse = responseObj;
        if (!currentResponse.hasOwnProperty('completion')) {
            query.onCompletion({
                error: {
                    type: "api",
                    message: "接口未返回结果",
                    addtion: JSON.stringify(responseObj),
                },
            });
            return resultText;
        }
        resultText = currentResponse['completion'];
        query.onStream({
            result: {
                from: query.detectFrom,
                to: query.detectTo,
                toParagraphs: [resultText],
            },
        });
        return resultText;
    } catch (err) {
        query.onCompletion({
            error: {
                type: err._type || "param",
                message: err.message || "JSON 解析错误",
                addtion: err._addition,
            },
        });
    }
    return resultText;
}

/**
 * @type {Bob.Translate}
 */
function translate(query) {
    if (!lang.langMap.get(query.detectTo)) {
        query.onCompletion({
            error: {
                type: "unsupportLanguage",
                message: "不支持该语种",
                addtion: "不支持该语种",
            },
        });
    }

    const { model, apiKeys = '', apiUrl = 'https://api.anthropic.com' } = $option;

    const apiKeySelection = apiKeys.split(",").map(key => key.trim());
    if (!apiKeySelection.length) {
        query.onCompletion({
            error: {
                type: "secretKey",
                message: "配置错误 - 未填写 API Keys",
                addtion: "请在插件配置中填写 API Keys",
            },
        })
    }
    const apiKey = apiKeySelection[Math.floor(Math.random() * apiKeySelection.length)];
    
    const apiUrlPath = "/v1/complete";
    
    const header = buildHeader(apiKey);
    const body = buildRequestBody(model, query);

    (async () => {
        let targetText = '';
        let buffer = '';
        await $http.streamRequest({
            method: "POST",
            url: apiUrl + apiUrlPath,
            header,
            body,
            cancelSignal: query.cancelSignal,
            streamHandler: (streamData) => {
                const splitedText = streamData.text.split('\n');
                if (splitedText[0] && splitedText[0].trim() === 'event: completion') {
                    const line = splitedText[1].trim();
                    const match = line.startsWith('data:') ? line.slice(5) : line;
                    const textFromResponse = match.trim();
                    try {
                        if (textFromResponse !== '[DONE]' && !textFromResponse.includes('"completion":""')) {
                            const responseObj = JSON.parse(textFromResponse);
                            targetText = handleResponse(query, targetText, responseObj);
                        }
                    } catch (err) {
                        buffer = splitedText[1];
                    }                    
                } else if (splitedText[0] && !['event: completion', 'event: ping'].includes(splitedText[0].trim())) {
                    buffer += splitedText[0];
                    const match = buffer.startsWith('data:') ? buffer.slice(5) : buffer;
                    const textFromResponse = match.trim();
                    if (textFromResponse !== '[DONE]') {
                        const responseObj = JSON.parse(textFromResponse);
                        targetText = handleResponse(query, targetText, responseObj);
                        buffer = '';
                    }
                }
            },
            handler: (result) => {
                if (result.error || result.response.statusCode >= 400) {
                    handleError(query, result);
                } else {
                    query.onCompletion({
                        result: {
                            from: query.detectFrom,
                            to: query.detectTo,
                            toParagraphs: [targetText],
                        },
                    });
                }
            },
        });
    })().catch((err) => {
        query.onCompletion({
            error: {
                type: err._type || "unknown",
                message: err._message || "未知错误",
                addtion: err._addition,
            },
        });
    });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
