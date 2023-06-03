//@ts-check

var lang = require("./lang.js");

function supportLanguages() {
    return lang.supportLanguages.map(([standardLang]) => standardLang);
}

/**
 * @param {string} apiKey - The authentication API key.
 * @returns {{
*   "Content-Type": string;
*   "x-api-key": string;
* }} The header object.
*/
function buildHeader(apiKey) {
    return {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
    };
}

/**
 * @param {Bob.TranslateQuery} query
 * @returns {string}
*/
function generatePrompts(query) {
    const translationPrefixPrompt = 'Translate below text in triple backticks'
    let userPrompt = `${translationPrefixPrompt} from ${lang.langMap.get(query.detectFrom) || query.detectFrom} to ${lang.langMap.get(query.detectTo) || query.detectTo}`;

    if (query.detectTo === "wyw" || query.detectTo === "yue") {
        userPrompt = `${translationPrefixPrompt} to ${lang.langMap.get(query.detectTo) || query.detectTo}`;
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
        userPrompt = `Polish the sentence in triple backticks to ${query.detectTo}`;
    }

    userPrompt = `${userPrompt}:\n
\`\`\`
${query.text}
\`\`\`
Just give me the result without any extra words or symbol.`

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
        prompt: `\n\nHuman: ${prompt}\n\nAssistant: OK, here is the result:`,
        max_tokens_to_sample: 1000,
        stop_sequences: [
            "\n\nHuman:"
        ],
        temperature: 0,
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
 * @param {string} textFromResponse
 * @returns {string}
*/
function handleResponse(query, targetText, textFromResponse) {
    let resultText = targetText;
    if (textFromResponse !== '[DONE]') {
        try {
            const currentResponse = JSON.parse(textFromResponse);
            const currentCompletion = currentResponse['completion'];
            if (!currentCompletion) {
                query.onCompletion({
                    error: {
                        type: "api",
                        message: "接口未返回结果",
                        addtion: textFromResponse,
                    },
                });
                return resultText;
            }
            resultText = currentCompletion;
        
            if (resultText.startsWith('"') || resultText.startsWith("「")) {
                resultText = resultText.slice(1);
            }
            if (resultText.endsWith('"') || resultText.endsWith("」")) {
                resultText = resultText.slice(0, -1);
            }
            resultText = resultText.trim();
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

    const { model, apiKeys = '', apiUrl } = $option;

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
        await $http.streamRequest({
            method: "POST",
            url: apiUrl + apiUrlPath,
            header,
            body,
            cancelSignal: query.cancelSignal,
            streamHandler: (streamData) => {
                const line = streamData.text.split('\n')[0].trim();
                const match = line.startsWith('data:') ? line.slice(5) : line;
                const textFromResponse = match.trim();
                targetText = handleResponse(query, targetText, textFromResponse);
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
