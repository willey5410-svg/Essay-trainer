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
          reason: 'the replacement of human labor by AI',
          principle: 'AI automates tasks that once required human judgment, reducing the demand for workers',
          condition: 'companies adopt AI systems without restriction',
          result: 'widespread unemployment and social instability',
          example: 'the manufacturing and customer service industries',
          explanation: 'have already cut thousands of jobs through automation',
          keyConcept: 'unregulated automation',
          conclusion: 'destabilizing the labor market',
        },
        ja: 'まず第一に、AIによる人間の労働の代替は考慮すべき重要な要素である。これは、AIがかつて人間の判断を要した業務を自動化し、労働者への需要を減らすためである。要するに、企業が無制限にAIシステムを導入すれば、必然的に大規模な失業と社会不安につながる。顕著な例は製造業やカスタマーサービス業界に見られ、既に自動化によって何千もの雇用が失われている。したがって、規制なき自動化が労働市場の不安定化に決定的な役割を果たすことは明らかである。',
      },
      {
        slots: {
          reason: 'the spread of AI-generated misinformation',
          principle: 'AI can produce convincing fake content on a massive scale at almost no cost',
          condition: 'false information circulates faster than it can be corrected',
          result: 'public distrust and social confusion',
          example: 'deepfake videos have already misled voters during recent elections',
          explanation: 'easily fabricated content can distort democratic processes',
          keyConcept: 'strict oversight of AI-generated content',
          conclusion: 'protecting the integrity of public information',
        },
        ja: 'もう一つの重要な考慮点は、AIが生成する偽情報の拡散である。これは、AIがほぼコストをかけずに説得力のある偽コンテンツを大量に作り出せることに起因する。端的に言えば、誤情報が訂正されるより速く広まれば、社会の不信と混乱を招きがちである。例えば、ディープフェイク動画は近年の選挙で有権者を誤導しており、捏造されたコンテンツがいかに容易に民主的プロセスを歪めるかを示している。ゆえに、AI生成コンテンツへの厳格な監視が公共情報の健全性を守るために不可欠であることは明らかである。',
      },
      {
        slots: {
          reason: 'the risk of AI systems making unaccountable decisions',
          principle: 'complex algorithms often operate in ways that even their developers cannot fully explain',
          condition: 'critical decisions are left entirely to machines',
          result: 'errors that no one can detect or correct in time',
          example: 'the financial sector',
          explanation: 'algorithmic trading has triggered sudden market crashes within minutes',
          keyConcept: 'human oversight',
          conclusion: 'ensuring that technology remains safe and accountable',
        },
        ja: 'さらなる論点は、AIシステムが説明責任を欠いた決定を下すリスクである。その主な理由は、複雑なアルゴリズムは開発者でさえ完全には説明できない形で動作することが多いためである。言い換えれば、重要な決定を完全に機械に委ねれば、誰も適時に発見・修正できない誤りにつながりかねない。その証拠は金融セクターに見られ、アルゴリズム取引が数分のうちに突然の市場暴落を引き起こしてきた。したがって、人間による監督は、技術を安全で説明可能なものに保つうえで極めて重要な役割を果たす。',
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
          reason: 'ensuring equal access to higher education',
          principle: 'education provides the knowledge and skills necessary for social mobility',
          condition: 'tuition fees prevent talented students from attending university',
          result: 'a society where success depends on family wealth rather than ability',
          example: 'countries such as Germany and Norway',
          explanation: 'have increased university enrollment among low-income students through free tuition',
          keyConcept: 'financial accessibility',
          conclusion: 'creating a fair and meritocratic society',
        },
        ja: 'まず第一に、高等教育への平等なアクセスの確保は考慮すべき重要な要素である。これは、教育が社会的流動性に必要な知識と技能を提供するためである。要するに、学費が優秀な学生の大学進学を妨げれば、必然的に成功が能力ではなく家庭の資産で決まる社会につながる。顕著な例はドイツやノルウェーなどの国々に見られ、無償化によって低所得層の学生の大学進学率を高めている。したがって、経済的なアクセスのしやすさが公正で実力主義的な社会の実現に決定的な役割を果たすことは明らかである。',
      },
      {
        slots: {
          reason: 'the long-term economic benefits of an educated workforce',
          principle: 'a highly educated population drives innovation and productivity',
          condition: 'more citizens obtain advanced skills and qualifications',
          result: 'stronger economic growth and greater international competitiveness',
          example: 'South Korea has transformed its economy through massive investment in education',
          explanation: 'public spending on education can produce national prosperity',
          keyConcept: 'investment in higher education',
          conclusion: 'sustaining long-term economic development',
        },
        ja: 'もう一つの重要な考慮点は、教育を受けた労働力がもたらす長期的な経済的利益である。これは、高度な教育を受けた国民がイノベーションと生産性を牽引するという事実に起因する。端的に言えば、より多くの国民が高度な技能や資格を得るほど、より強い経済成長と国際競争力の強化につながりやすい。例えば、韓国は教育への大規模な投資によって経済を変革しており、教育への公的支出がいかに国家の繁栄を生み出すかを示している。ゆえに、高等教育への投資が長期的な経済発展の維持に不可欠であることは明らかである。',
      },
      {
        slots: {
          reason: 'reducing the financial burden on young families',
          principle: 'the high cost of education discourages young couples from having children',
          condition: 'parents expect enormous tuition expenses in the future',
          result: 'further declines in the birthrate',
          example: 'Japan',
          explanation: 'education costs are frequently cited as a major reason for having fewer children',
          keyConcept: 'free university education',
          conclusion: 'supporting families and stabilizing the population',
        },
        ja: 'さらなる論点は、若い家庭の経済的負担の軽減である。その主な理由は、教育費の高さが若い夫婦に子どもを持つことをためらわせるためである。言い換えれば、親が将来の莫大な学費を見込めば、少子化のさらなる進行につながりかねない。その証拠は日本に見られ、教育費は子どもを少なく持つ主要な理由として頻繁に挙げられている。したがって、大学教育の無償化は家庭を支え人口を安定させるうえで極めて重要な役割を果たす。',
      },
    ],
  },
];
