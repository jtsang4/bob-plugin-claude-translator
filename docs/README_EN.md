<h4 align="right">
  <a href="https://github.com/jtsang4/bob-plugin-claude-translator/blob/main/README.md">简体中文</a> | <strong>English</strong>
</h4>

<div>
  <h1 align="center">Claude Translator Bob Plugin</h1>
  <p align="center">
    <a href="https://github.com/jtsang4/bob-plugin-claude-translator/releases" target="_blank">
        <img src="https://github.com/jtsang4/bob-plugin-claude-translator/actions/workflows/release.yaml/badge.svg" alt="release">
    </a>
    <a href="https://github.com/jtsang4/bob-plugin-claude-translator/releases">
        <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/jtsang4/bob-plugin-claude-translator?style=flat">
    </a>
    <a href="https://github.com/jtsang4/bob-plugin-claude-translator/releases">
        <img alt="GitHub Repo stars" src="https://img.shields.io/badge/claude-bob-orange?style=flat">
    </a>
    <a href="https://github.com/jtsang4/bob-plugin-claude-translator/releases">
        <img alt="GitHub Repo stars" src="https://img.shields.io/badge/langurage-JavaScript-brightgreen?style=flat&color=blue">
    </a>
  </p>
</div>

## Introduction

[Bob](https://bobtranslate.com/) plugin based on [Anthropic Complete API]([Anthropic Complete API](https://console.anthropic.com/docs/api/reference)). Has translation and retouching functions.

### Polishing

You can use the Claude API to polish and syntactically modify sentences, you just need to set the target language to be the same as the source language.

### Language Model

* `claude-v1`: Use the latest version of v1 automatically
* `claude-v1-100k`: An enhanced version of claude-v1 with a 100,000 token (roughly 75,000 word) context window.
* `claude-v1.0`: Current default for claude-v1
* `claude-v1.2`: Earlier version of claude-v1
* `claude-v1.3` (default): A significantly improved version of claude-v1. Compared to claude-v1.2, it's more robust and precise
* `claude-v1.3-100k`: An enhanced version of claude-v1.3 with a 100,000 token (roughly 75,000 word) context window
* `claude-instant-v1`: A cut-down version of claude-v1, with faster response speed, but slightly worse effect
* `claude-instant-v1-100k`: An enhanced version of claude-instant-v1 with a 100,000 token context window that retains its performance
* `claude-instant-v1.0`: Earlier version of claude-instant-v1
* `claude-instant-v1.1`: Current default for claude-instant-v1
* `claude-instant-v1.1-100k`: An enhanced version of claude-instant-v1.1 with a 100,000 token context window that retains its performance

## Usage


1. Install [Bob](https://bobtranslate.com/guide/#%E5%AE%89%E8%A3%85) (version >= 0.50), a translation and OCR software for the macOS platform

2. Download this plugin: [claude-translator.bobplugin](https://github.com/jtsang4/bob-plugin-claude-translator/releases/latest)

3. Install this plugin

4. Get your access key from [Claude](https://console.anthropic.com/account/keys)

5. Enter the API KEY in Bob Preferences > Services > This plugin configuration interface's API KEY input box

6. (Optional) Install [PopClip](https://bobtranslate.com/guide/integration/popclip.html) to achieve the floating icon appearing near the mouse after selecting words

## Thanks

This repository is based on the excellent [bob-plugin-openai-translator](https://github.com/yetone/bob-plugin-openai-translator) from [yetone](https://github.com/yetone) This is an adaptation of the Claude API based on the source code, thanks to the excellent contribution of the original author.
