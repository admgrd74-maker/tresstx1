/* Leçon par défaut — format v2 nouveau.
   - steps[]  : répliques vocales. changeBoard:true = le tableau avance ici.
   - boards[] : liste ordonnée d'états du tableau (aucune référence aux steps).
   Le tableau change uniquement quand changeBoard:true est présent dans le step.
   Les steps "moi" (bip) et les steps sans changeBoard laissent le tableau inchangé.
*/
window.MT_LESSON = {
  format: "mt-lesson",
  version: 2,
  title: "Les mots en « -able / -ible »",
  pair: "fr-en",

  characters: {
    prof:   { name: "Professeur" },
    eleve1: { name: "Sophie" },
    eleve2: { name: "Julien" }
  },

  steps: [
    // ── Board 0 : possible + table introduits ──────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Les mots en « -ible »… <b>possible</b>. Et un mot de tous les jours : <b>table</b>.',
      speak:[["Les mots en -ible. Il y a...","fr"],["possible","en"],[". Et un mot de tous les jours :","fr"],["table","en"]],
      audio:null },

    { role:"prof",
      fr:'Vous saviez même pas que vous connaissiez ces mots, en anglais !',
      speak:[["Vous saviez même pas que vous connaissiez ces mots, en anglais !","fr"]], audio:null },

    // ── Board 1 : "table" en question ─────────────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Petit exercice. <b>« table »</b> en anglais ?',
      speak:[["Petit exercice.","fr"],["table","en"],["en anglais ?","fr"]], audio:null },

    { role:"moi" },

    { role:"eleve1", tag:"hésitante", fr:'Table ?', speak:[["table","en"]], audio:null },

    { role:"prof",
      fr:'Table, c'est pas mal. <b>Table</b> : table.',
      speak:[["table","en"],[", c'est pas mal.","fr"],["table","en"]], audio:null },

    { role:"eleve2", tag:"timide", fr:'Table ?', speak:[["table","en"]], audio:null },

    // ── Board 2 : "possible" en question ──────────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Okay. <b>« possible »</b> ?',
      speak:[["Okay.","fr"],["possible","en"],["?","fr"]], audio:null },

    { role:"moi" },

    { role:"eleve1", tag:"réfléchit", fr:'Possible... possible ?', speak:[["possible... possible","en"]], audio:null },

    // ── Board 3 : "terrible" en question ──────────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Possible. Et… <b>« terrible »</b> ?',
      speak:[["possible","en"],[". Et…","fr"],["terrible","en"],["?","fr"]], audio:null },

    { role:"moi" },

    { role:"eleve1", fr:'Terrible ?', speak:[["terrible","en"]], audio:null },

    { role:"prof", tag:"petit rire",
      fr:'Terrible. Petit souci sur le « R », on verra plus tard.',
      speak:[["terrible","en"],[". Petit souci sur le R, on verra plus tard.","fr"]], audio:null },

    // ── Board 4 : "acceptable" en question ───────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Un autre : <b>« acceptable »</b> ?',
      speak:[["Un autre :","fr"],["acceptable","en"],["?","fr"]], audio:null },

    { role:"moi" },

    { role:"eleve1", tag:"découpe lentement", fr:'Ac-ceptable ?', speak:[["acceptable","en"]], audio:null },

    // ── Board 5 : "comfortable" en question ──────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Acceptable. Plus dur : « confortable ». Attention : <b>comfortable</b>.',
      speak:[["acceptable","en"],[". Plus dur : confortable. Attention :","fr"],["comfortable","en"]], audio:null },

    { role:"moi" },

    { role:"eleve1", fr:'Comfortable ?', speak:[["comfortable","en"]], audio:null },

    // ── Board 6 : it is + possible ────────────────────────────────────
    { role:"prof", changeBoard:true,
      fr:'Pour dire « c'est » : <b>it is</b>. Et « c'est possible » : <b>it is possible</b>.',
      speak:[["Pour dire c'est :","fr"],["it is","en"],[". Et c'est possible :","fr"],["it is possible","en"]],
      audio:null },

    { role:"moi" },

    { role:"eleve2", tag:"bégaye", fr:'It is p- p- poss… possible ?', speak:[["it is, p, p, possible","en"]], audio:null },

    // ── Board 7 : contraction ─────────────────────────────────────────
    { role:"prof", changeBoard:true,
      fr:'It is possible. Ou la contraction : <b>it's possible</b>.',
      speak:[["it is possible. Ou la contraction :","fr"],["it's possible","en"]], audio:null }
  ],

  boards: [
    // État 0 — déclenché au step 0 (prof introduit possible + table)
    { reveals:[
      {en:"possible", phon:"po-si-beul", at:1.6},
      {en:"table",    phon:"téï-beul",   at:4.2}
    ]},

    // État 1 — déclenché au step 2 (prof demande "table ?")
    { reveals:[
      {en:"table", phon:"téï-beul", at:0, q:true, size:"l"}
    ]},

    // État 2 — déclenché au step 7 (prof demande "possible ?")
    { reveals:[
      {en:"possible", phon:"po-si-beul", at:0, q:true, size:"l"}
    ]},

    // État 3 — déclenché au step 10 (prof demande "terrible ?")
    { reveals:[
      {en:"terrible", phon:"tè-ri-beul", at:0, q:true, size:"l"}
    ]},

    // État 4 — déclenché au step 14 (prof demande "acceptable ?")
    { reveals:[
      {en:"acceptable", phon:"ak-sèp-ta-beul", at:0, q:true, size:"l"}
    ]},

    // État 5 — déclenché au step 17 (prof demande "comfortable ?")
    { reveals:[
      {en:"comfortable", phon:"keum-feu-teu-beul", at:0, q:true, size:"l"}
    ]},

    // État 6 — déclenché au step 20 (prof explique it is + possible)
    { reveals:[
      {en:"it is",    phon:"it iz",      at:1.3},
      {en:"possible", phon:"po-si-beul", at:4.0}
    ]},

    // État 7 — déclenché au step 23 (prof montre la contraction)
    { reveals:[
      {en:"it's possible", phon:"itss po-si-beul", at:0}
    ]}
  ]
};
