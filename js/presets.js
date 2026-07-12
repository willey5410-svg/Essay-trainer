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
          reason: 'the large-scale reshaping of the labor force by AI',
          principle: 'AI handles complex judgment tasks at minimal cost',
          condition: 'companies automate without restraint',
          result: 'widespread structural unemployment',
          keyConcept: 'unregulated automation',
          conclusion: 'destabilizing the labor market',
        },
        ja: 'まず第一に、AIによる労働力の大規模な再編は極めて重要な要素である。これは、AIが複雑な判断業務を最小限のコストでこなすためである。要するに、企業が歯止めなく自動化を進めれば、広範な構造的失業につながる。したがって、規制なき自動化は労働市場の不安定化に重要な役割を果たす。',
      },
      {
        slots: {
          reason: 'the rapid spread of AI-generated misinformation',
          principle: 'AI fabricates convincing false content at almost no cost',
          condition: 'false stories flood social media',
          result: 'deep public distrust and confusion',
          keyConcept: 'strict content oversight',
          conclusion: 'protecting healthy public debate',
        },
        ja: 'もう一つの重要な点は、AIが生成する偽情報の急速な拡散である。これは主に、AIがほぼコストをかけずに説得力のある偽コンテンツを作り出せるためである。端的に言えば、偽の情報がSNSにあふれれば、社会の深い不信と混乱を招く。ゆえに、コンテンツへの厳格な監視は健全な公共の議論を守るために不可欠である。',
      },
      {
        slots: {
          reason: 'the growing opacity of algorithmic decision-making',
          principle: 'developers cannot fully explain how AI reaches conclusions',
          condition: 'machines make critical judgments alone',
          result: 'errors that nobody can promptly correct',
          keyConcept: 'constant human oversight',
          conclusion: 'keeping advanced technology accountable',
        },
        ja: 'さらなる論点は、アルゴリズムによる意思決定の不透明さが増していることである。その主な理由は、開発者でさえAIがどう結論に至るかを完全には説明できないことである。言い換えれば、機械が単独で重要な判断を下せば、誰も即座に修正できない誤りにつながる。したがって、常時の人間による監督は先端技術の説明責任を保つうえで極めて重要である。',
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
          reason: 'equal access to higher education',
          principle: 'education provides the skills needed for social mobility',
          condition: 'tuition shuts out talented students',
          result: 'a society divided by wealth',
          keyConcept: 'financial accessibility',
          conclusion: 'building a truly meritocratic society',
        },
        ja: 'まず第一に、高等教育への平等なアクセスは極めて重要な要素である。これは、教育が社会的流動性に必要な技能を与えるためである。要するに、学費が優秀な学生を締め出せば、資産で分断された社会につながる。したがって、経済的なアクセスのしやすさは真の実力主義社会の構築に重要な役割を果たす。',
      },
      {
        slots: {
          reason: 'the economic power of a highly educated workforce',
          principle: 'educated citizens drive innovation and raise national productivity',
          condition: 'more people gain advanced skills',
          result: 'stronger growth and global competitiveness',
          keyConcept: 'public investment in education',
          conclusion: 'sustaining long-term economic development',
        },
        ja: 'もう一つの重要な点は、高度な教育を受けた労働力の経済的な力である。これは主に、教育を受けた国民がイノベーションを牽引し、国の生産性を高めるためである。端的に言えば、より多くの人が高度な技能を得れば、より強い成長と国際競争力につながる。ゆえに、教育への公的投資は長期的な経済発展の維持に不可欠である。',
      },
      {
        slots: {
          reason: 'the rising cost structure facing young families',
          principle: 'soaring education costs discourage couples from having children',
          condition: 'parents anticipate enormous tuition bills',
          result: 'a further decline in the birthrate',
          keyConcept: 'free university education',
          conclusion: 'stabilizing the shrinking population',
        },
        ja: 'さらなる論点は、若い家庭が直面する費用構造の高まりである。その主な理由は、高騰する教育費が夫婦に子どもを持つことをためらわせることである。言い換えれば、親が莫大な学費を見込めば、少子化のさらなる進行につながる。したがって、大学教育の無償化は縮小する人口の安定化に極めて重要である。',
      },
    ],
  },
];
