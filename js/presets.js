/* プリセットデータ：テーマ案と、APIキーなしでも試せるサンプルエッセイ */

const CATEGORIES = ['テクノロジー', '環境', '教育', '社会', '政治', '医療・健康'];

const PRESET_THEMES = [
  { topic: 'Should the development of artificial intelligence be strictly regulated?', topicJa: 'AIの開発は厳しく規制されるべきか', category: 'テクノロジー' },
  { topic: 'Agree or disagree: Social media does more harm than good to society', topicJa: 'SNSは社会にとって害の方が大きい：賛成か反対か', category: 'テクノロジー' },
  { topic: 'Agree or disagree: Space exploration is a worthwhile investment', topicJa: '宇宙開発は価値ある投資である：賛成か反対か', category: 'テクノロジー' },
  { topic: 'Can renewable energy fully replace fossil fuels?', topicJa: '再生可能エネルギーは化石燃料を完全に代替できるか', category: '環境' },
  { topic: 'Should developed countries do more to combat climate change?', topicJa: '先進国は気候変動対策をもっと行うべきか', category: '環境' },
  { topic: 'Should university education be free for all students?', topicJa: '大学教育はすべての学生に無償であるべきか', category: '教育' },
  { topic: 'Agree or disagree: The death penalty should be abolished in Japan', topicJa: '日本で死刑は廃止されるべきである：賛成か反対か', category: '社会' },
  { topic: 'Is globalization beneficial for developing countries?', topicJa: 'グローバル化は発展途上国にとって有益か', category: '社会' },
  { topic: 'Should the retirement age be raised?', topicJa: '定年は引き上げられるべきか', category: '社会' },
  { topic: 'Should Japan accept more immigrants to address its labor shortage?', topicJa: '日本は労働力不足対策として移民をより多く受け入れるべきか', category: '政治' },
  { topic: "Agree or disagree: Nuclear power is necessary for Japan's energy security", topicJa: '原子力は日本のエネルギー安全保障に必要である：賛成か反対か', category: '政治' },
  { topic: 'Should governments prioritize public health over economic growth?', topicJa: '政府は経済成長より公衆衛生を優先すべきか', category: '医療・健康' },
];

const PRESET_SETS = [
  {
    id: 'preset-ai-regulation',
    topic: 'Should the development of artificial intelligence be strictly regulated?',
    topicJa: 'AIの開発は厳しく規制されるべきか',
    stance: 'agree',
    source: 'preset',
    createdAt: 0,
    bodies: [
      {
        slots: {
          reason: 'replacing workers with AI',
          principle: 'AI automates human tasks',
          condition: 'AI spreads unchecked',
          result: 'mass unemployment',
          example: 'customer service',
          explanation: 'has lost thousands of jobs',
          keyConcept: 'unregulated automation',
          conclusion: 'destabilizing employment',
        },
        ja: 'まず第一に、労働者をAIで置き換えることは極めて重要な要素である。これは、AIが人間の業務を自動化するためである。要するに、AIが無制限に広がれば、大量失業につながる。一例がカスタマーサービスで、既に何千もの雇用が失われている。したがって、規制なき自動化は雇用の不安定化に重要な役割を果たす。',
      },
      {
        slots: {
          reason: 'AI-generated misinformation',
          principle: 'AI creates fake content cheaply',
          condition: 'false information spreads unchecked',
          result: 'public distrust',
          example: 'deepfake videos have misled voters',
          explanation: 'fabricated content distorts democracy',
          keyConcept: 'strict oversight',
          conclusion: 'protecting public information',
        },
        ja: 'もう一つの重要な点は、AIが生成する偽情報である。これは主に、AIが安価に偽コンテンツを作り出せるためである。端的に言えば、誤情報が野放しに広がれば、社会の不信を招く。例えば、ディープフェイク動画は有権者を誤導しており、捏造コンテンツがいかに民主主義を歪めるかを示している。ゆえに、厳格な監視は公共情報を守るために不可欠である。',
      },
      {
        slots: {
          reason: 'unaccountable AI decisions',
          principle: 'algorithms defy full explanation',
          condition: 'machines decide alone',
          result: 'undetectable errors',
          example: 'the financial sector',
          explanation: 'algorithmic trading caused sudden crashes',
          keyConcept: 'human oversight',
          conclusion: 'keeping technology accountable',
        },
        ja: 'さらなる論点は、説明責任を欠いたAIの決定である。その主な理由は、アルゴリズムは完全には説明できないことである。言い換えれば、機械が単独で判断すれば、発見できない誤りにつながる。これは金融セクターに顕著で、アルゴリズム取引が突然の暴落を引き起こした。したがって、人間による監督は技術の説明責任を保つうえで極めて重要である。',
      },
    ],
  },
  {
    id: 'preset-free-university',
    topic: 'Should university education be free for all students?',
    topicJa: '大学教育はすべての学生に無償であるべきか',
    stance: 'agree',
    source: 'preset',
    createdAt: 0,
    bodies: [
      {
        slots: {
          reason: 'equal access to education',
          principle: 'education enables social mobility',
          condition: 'tuition blocks talented students',
          result: 'wealth-based inequality',
          example: 'Germany',
          explanation: 'has boosted low-income university enrollment',
          keyConcept: 'financial accessibility',
          conclusion: 'building a meritocratic society',
        },
        ja: 'まず第一に、教育への平等なアクセスは極めて重要な要素である。これは、教育が社会的流動性を可能にするためである。要するに、学費が優秀な学生を阻めば、資産による格差につながる。一例がドイツで、低所得層の大学進学率を高めている。したがって、経済的なアクセスのしやすさは実力主義社会の構築に重要な役割を果たす。',
      },
      {
        slots: {
          reason: 'an educated workforce',
          principle: 'educated citizens drive innovation',
          condition: 'more citizens gain skills',
          result: 'stronger economic growth',
          example: 'South Korea grew through education spending',
          explanation: 'public spending creates prosperity',
          keyConcept: 'investment in education',
          conclusion: 'sustaining economic development',
        },
        ja: 'もう一つの重要な点は、教育を受けた労働力である。これは主に、教育を受けた国民がイノベーションを牽引するためである。端的に言えば、より多くの国民が技能を得れば、より強い経済成長につながる。例えば、韓国は教育投資によって成長を遂げており、公的支出がいかに繁栄を生むかを示している。ゆえに、教育への投資は経済発展の維持に不可欠である。',
      },
      {
        slots: {
          reason: 'family financial burdens',
          principle: 'education costs discourage having children',
          condition: 'parents expect huge tuition fees',
          result: 'further birthrate decline',
          example: 'Japan',
          explanation: 'many cite tuition as a deterrent',
          keyConcept: 'free university education',
          conclusion: 'stabilizing the population',
        },
        ja: 'さらなる論点は、家庭の経済的負担である。その主な理由は、教育費が子どもを持つことをためらわせることである。言い換えれば、親が莫大な学費を見込めば、少子化のさらなる進行につながる。これは日本に顕著で、多くの人が学費を出産をためらう理由に挙げている。したがって、大学無償化は人口の安定に極めて重要である。',
      },
    ],
  },
];
