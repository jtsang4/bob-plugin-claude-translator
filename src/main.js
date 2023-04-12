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
    let userPrompt = `Translate from ${lang.langMap.get(query.detectFrom) || query.detectFrom} to ${lang.langMap.get(query.detectTo) || query.detectTo}`;

    if (query.detectTo === "wyw" || query.detectTo === "yue") {
        userPrompt = `翻译成${lang.langMap.get(query.detectTo) || query.detectTo}`;
    }

    if (
        query.detectFrom === "wyw" ||
        query.detectFrom === "zh-Hans" ||
        query.detectFrom === "zh-Hant"
    ) {
        if (query.detectTo === "zh-Hant") {
            userPrompt = "翻译成繁体白话文";
        } else if (query.detectTo === "zh-Hans") {
            userPrompt = "翻译成简体白话文";
        } else if (query.detectTo === "yue") {
            userPrompt = "翻译成粤语白话文";
        }
    }
    if (query.detectFrom === query.detectTo) {
        if (query.detectTo === "zh-Hant" || query.detectTo === "zh-Hans") {
            userPrompt = "润色此句";
        } else {
            userPrompt = "polish the sentence";
        }
    }

    userPrompt = `${userPrompt}:\n\n\
Here is the text in "<content>" tag:\n\n\
<content>${query.text}</content>.\n\n\
Reply in <response> tag. Do not include the <content> tag used for wrapping original text.`

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
 * }}
*/
function buildRequestBody(model, query) {
    const prompt = generatePrompts(query);
    return {
        model,
        prompt: `\n\nHuman: ${prompt}\n\nAssistant: OK, here is the result: <response>`,
        max_tokens_to_sample: 1000,
        stop_sequences: [
            "\n\nHuman:"
        ],
        temperature: 0,
    };
}

/**
 * @param {Bob.Completion} completion
 * @param {Bob.HttpResponse} result
 * @returns {void}
*/
function handleError(completion, result) {
    const { statusCode } = result.response;
    const reason = (statusCode >= 400 && statusCode < 500) ? "param" : "api";
    completion({
        error: {
            type: reason,
            message: `接口响应错误 - ${result.data.detail}`,
            addtion: JSON.stringify(result),
        },
    });
}

/**
 * @param {Bob.Completion} completion
 * @param {Bob.TranslateQuery} query
 * @param {Bob.HttpResponse} result
 * @returns {void}
*/
function handleResponse(completion, query, result) {
    const { completion: resultText } = result.data;

    if (!resultText) {
        completion({
            error: {
                type: "api",
                message: "接口未返回结果",
                addtion: JSON.stringify(result),
            },
        });
        return;
    }

    let targetText = resultText.trim();

    if (targetText.startsWith('"') || targetText.startsWith("「")) {
        targetText = targetText.slice(1);
    }
    if (targetText.endsWith('"') || targetText.endsWith("」")) {
        targetText = targetText.slice(0, -1);
    }
    if (targetText.endsWith("</response>")) {
        targetText = targetText.slice(0, -11);
    }
    targetText = targetText.trim();

    completion({
        result: {
            from: query.detectFrom,
            to: query.detectTo,
            toParagraphs: targetText.split("\n"),
        },
    });
}

/**
 * @type {Bob.Translate}
 */
function translate(query, completion) {
    if (!lang.langMap.get(query.detectTo)) {
        completion({
            error: {
                type: "unsupportLanguage",
                message: "不支持该语种",
                addtion: "不支持该语种",
            },
        });
    }

    const { model, apiKeys, apiUrl } = $option;

    const apiKeySelection = apiKeys.split(",").map(key => key.trim());
    const apiKey = apiKeySelection[Math.floor(Math.random() * apiKeySelection.length)];
    
    const apiUrlPath = "/v1/complete";
    
    const header = buildHeader(apiKey);
    const body = buildRequestBody(model, query);

    (async () => {
        const result = await $http.request({
            method: "POST",
            url: apiUrl + apiUrlPath,
            header,
            body,
        });

        if (result.error) {
            handleError(completion, result);
        } else {
            handleResponse(completion, query, result);
        }
    })().catch((err) => {
        completion({
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
