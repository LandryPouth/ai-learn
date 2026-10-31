"use strict";

// Fingerprints (SHA-256 of the LF-normalised bytes) of every skill ai-learn
// rendered for a command that story 10.01 retired, across every revision of
// commands/ published since skills were introduced (08.03, fe34111): fe34111,
// bed8222, d274e60, f1227fb. Rebuilt from `git show <rev>:commands/…` and the
// renderers of that time — never from the working tree. An installed file whose
// fingerprint is listed here is byte-identical to what we wrote and may be
// removed; anything else is the learner's and is kept.

const RETIRED_SKILLS = {
  claude: {
    "check": [
      "4dcf3ab30945e7979c8dca7657a3dfe77bbcdaaf455322690d467a6d4c68ce28",
    ],
    "docs": [
      "fb2049ccabaac81109a0d052e9a0185150f47a10eb4bb671e636a135f01e45fa",
    ],
    "learn-check": [
      "7a958821e3c7f12551eef37b81c2f5eded4df0e2889cc658dcd33cdb1f1509c4",
    ],
    "learn-docs": [
      "52a221f52b45493b2b5311322adb8a1c7ee53fb7442d7807f0f60caf44904baf",
    ],
    "learn-propose": [
      "62293080b34a5065c0f312817beedc44d46598b3f54c9e89aaba8883a5d1250a",
    ],
    "learn-scan": [
      "0157db06e33baea125ca7a44012d64848cae9f708ed42ada8250609c1222c25f",
    ],
    "next": [
      "390f491d9af05ead6e4907130a648efb82119ab7ee04579a32840a622366c875",
      "3be6d5632ce9b727de02dedac26ae5cb1aad997714b7e1040c31e6258a4fa207",
      "55ffb9a31f1bc9ece5408bf152108a0ce23a7e9242581ac70c45c3d9445b5a3c",
    ],
    "propose": [
      "d0d54aa512825595e3ed07ad780d49d9a36b6192773d328c3c4f8b30a3cc52ce",
    ],
    "scan": [
      "326ed3a28a405ad359ad60c32a1493e233475c0cadb2f69390ec110355dcfbc7",
    ],
    "status": [
      "4adaf27339b8a4f51e6e217799c2d86302b3609c6100381c9e58d56ba3ddf238",
    ],
  },
  opencode: {
    "check": [
      "4dcf3ab30945e7979c8dca7657a3dfe77bbcdaaf455322690d467a6d4c68ce28",
    ],
    "docs": [
      "fb2049ccabaac81109a0d052e9a0185150f47a10eb4bb671e636a135f01e45fa",
    ],
    "learn-check": [
      "7a958821e3c7f12551eef37b81c2f5eded4df0e2889cc658dcd33cdb1f1509c4",
    ],
    "learn-docs": [
      "52a221f52b45493b2b5311322adb8a1c7ee53fb7442d7807f0f60caf44904baf",
    ],
    "learn-propose": [
      "62293080b34a5065c0f312817beedc44d46598b3f54c9e89aaba8883a5d1250a",
    ],
    "learn-scan": [
      "0157db06e33baea125ca7a44012d64848cae9f708ed42ada8250609c1222c25f",
    ],
    "next": [
      "390f491d9af05ead6e4907130a648efb82119ab7ee04579a32840a622366c875",
      "3be6d5632ce9b727de02dedac26ae5cb1aad997714b7e1040c31e6258a4fa207",
      "55ffb9a31f1bc9ece5408bf152108a0ce23a7e9242581ac70c45c3d9445b5a3c",
    ],
    "propose": [
      "d0d54aa512825595e3ed07ad780d49d9a36b6192773d328c3c4f8b30a3cc52ce",
    ],
    "scan": [
      "326ed3a28a405ad359ad60c32a1493e233475c0cadb2f69390ec110355dcfbc7",
    ],
    "status": [
      "4adaf27339b8a4f51e6e217799c2d86302b3609c6100381c9e58d56ba3ddf238",
    ],
  },
  codex: {
    "ai-learn-check": [
      "e9ad5a6ef57ca0bf2097eb415ba8d4b4b69129a3b368ee4c5de2e6a1059f2940",
    ],
    "ai-learn-docs": [
      "9181b6e5a4f5f402c30f1baa2f991942dcb341895d06218e81e007ba4cf18563",
    ],
    "ai-learn-learn-check": [
      "865efc234150e049a93e9fae01c9009b93956027d2671808f3ab4e3039f5dc25",
    ],
    "ai-learn-learn-docs": [
      "1ddc1f0d0cddc285e5fccb4519ae6d50b626cfb3eb5479c04b715a0d342eeae8",
    ],
    "ai-learn-learn-propose": [
      "ab1d1ff9669133b7eeb5a77ebbc75b8afbc8fd8c6c8c7aef5a9fb7bcbe92a851",
    ],
    "ai-learn-learn-scan": [
      "06f7dc71ff3df4b4b7e1636fa364ad8c76264a2a7bca380b75cc5682b6dff5be",
    ],
    "ai-learn-next": [
      "946239c28059965fac1e13e7bb9de5ccd79713ca19cc9b8a4a5ec7cc1ac3085f",
      "a38399ed1deaa576e34e5934f6508f85e4365e57b5a66f0c4f2ca49ca2d7f9b7",
      "f621687bfd8148983604f51ae38f3ae870f75e2f5212a746375020ba8c557306",
    ],
    "ai-learn-propose": [
      "f93a7bcd5ba34395b061d81a4ca0a52619c76bcf9cb623af914f6e994fd33478",
    ],
    "ai-learn-scan": [
      "7bb7381cab9ac497bb08b7234957838b25feafe7d71c66336f29bab90f304a09",
    ],
    "ai-learn-status": [
      "ea515ee36963a673548a11e7d8675f99b4ded0c2243ef15c87114c107a715888",
    ],
  },
  gemini: {
    "ai-learn-check": [
      "e9ad5a6ef57ca0bf2097eb415ba8d4b4b69129a3b368ee4c5de2e6a1059f2940",
    ],
    "ai-learn-docs": [
      "9181b6e5a4f5f402c30f1baa2f991942dcb341895d06218e81e007ba4cf18563",
    ],
    "ai-learn-learn-check": [
      "865efc234150e049a93e9fae01c9009b93956027d2671808f3ab4e3039f5dc25",
    ],
    "ai-learn-learn-docs": [
      "1ddc1f0d0cddc285e5fccb4519ae6d50b626cfb3eb5479c04b715a0d342eeae8",
    ],
    "ai-learn-learn-propose": [
      "ab1d1ff9669133b7eeb5a77ebbc75b8afbc8fd8c6c8c7aef5a9fb7bcbe92a851",
    ],
    "ai-learn-learn-scan": [
      "06f7dc71ff3df4b4b7e1636fa364ad8c76264a2a7bca380b75cc5682b6dff5be",
    ],
    "ai-learn-next": [
      "946239c28059965fac1e13e7bb9de5ccd79713ca19cc9b8a4a5ec7cc1ac3085f",
      "a38399ed1deaa576e34e5934f6508f85e4365e57b5a66f0c4f2ca49ca2d7f9b7",
      "f621687bfd8148983604f51ae38f3ae870f75e2f5212a746375020ba8c557306",
    ],
    "ai-learn-propose": [
      "f93a7bcd5ba34395b061d81a4ca0a52619c76bcf9cb623af914f6e994fd33478",
    ],
    "ai-learn-scan": [
      "7bb7381cab9ac497bb08b7234957838b25feafe7d71c66336f29bab90f304a09",
    ],
    "ai-learn-status": [
      "ea515ee36963a673548a11e7d8675f99b4ded0c2243ef15c87114c107a715888",
    ],
  },
  antigravity: {
    "ai-learn-check": [
      "e9ad5a6ef57ca0bf2097eb415ba8d4b4b69129a3b368ee4c5de2e6a1059f2940",
    ],
    "ai-learn-docs": [
      "9181b6e5a4f5f402c30f1baa2f991942dcb341895d06218e81e007ba4cf18563",
    ],
    "ai-learn-learn-check": [
      "865efc234150e049a93e9fae01c9009b93956027d2671808f3ab4e3039f5dc25",
    ],
    "ai-learn-learn-docs": [
      "1ddc1f0d0cddc285e5fccb4519ae6d50b626cfb3eb5479c04b715a0d342eeae8",
    ],
    "ai-learn-learn-propose": [
      "ab1d1ff9669133b7eeb5a77ebbc75b8afbc8fd8c6c8c7aef5a9fb7bcbe92a851",
    ],
    "ai-learn-learn-scan": [
      "06f7dc71ff3df4b4b7e1636fa364ad8c76264a2a7bca380b75cc5682b6dff5be",
    ],
    "ai-learn-next": [
      "946239c28059965fac1e13e7bb9de5ccd79713ca19cc9b8a4a5ec7cc1ac3085f",
      "a38399ed1deaa576e34e5934f6508f85e4365e57b5a66f0c4f2ca49ca2d7f9b7",
      "f621687bfd8148983604f51ae38f3ae870f75e2f5212a746375020ba8c557306",
    ],
    "ai-learn-propose": [
      "f93a7bcd5ba34395b061d81a4ca0a52619c76bcf9cb623af914f6e994fd33478",
    ],
    "ai-learn-scan": [
      "7bb7381cab9ac497bb08b7234957838b25feafe7d71c66336f29bab90f304a09",
    ],
    "ai-learn-status": [
      "ea515ee36963a673548a11e7d8675f99b4ded0c2243ef15c87114c107a715888",
    ],
  },
};

module.exports = { RETIRED_SKILLS };
