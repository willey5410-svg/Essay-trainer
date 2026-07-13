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
        argument: 'the large-scale reshaping of the labor force by AI',
        sentences: [
          'First of all, the rapid spread of AI inevitably leads to a large-scale reshaping of the labor force.',
          'As machines take over complex judgment tasks, the number of secure human jobs also steadily shrinks.',
          'Sooner or later, whole occupations will disappear faster than displaced workers can retrain for new ones.',
          'This burden on ordinary employees and their families will become intolerable without strict regulation.',
        ],
        ja: 'まず第一に、AIの急速な普及は労働力の大規模な再編を必然的に招く。機械が複雑な判断業務を引き受けるにつれ、安定した人間の仕事の数もまた着実に減っていく。遅かれ早かれ、職を失った人々が新しい仕事に転換するより速く、職業全体が消えていくだろう。厳格な規制がなければ、こうした普通の労働者とその家族への負担は耐え難いものになる。',
      },
      {
        argument: 'the rapid spread of AI-generated misinformation',
        sentences: [
          'Secondly, unregulated AI accelerates the spread of highly convincing misinformation across society.',
          'This is because modern systems can fabricate realistic text, images, and video at almost no cost.',
          'In fact, fabricated political stories and fake images already circulate widely on social media during elections.',
          'This means that public trust and healthy debate steadily erode unless such content is strictly overseen.',
        ],
        ja: '第二に、規制のないAIは、極めて説得力のある偽情報の社会への拡散を加速させる。これは、現代のシステムがほぼコストをかけずに本物らしい文章・画像・動画を捏造できるためである。実際、捏造された政治的な話や偽画像は、選挙のたびにSNS上で広く出回っている。つまり、そうしたコンテンツを厳しく監視しない限り、社会の信頼と健全な議論は着実に損なわれていく。',
      },
      {
        argument: 'the growing opacity of algorithmic decision-making',
        sentences: [
          'Finally, advanced AI concentrates critical decisions inside systems that very few people can understand.',
          'While some may argue that such innovation is best left to private companies,',
          'this is not the case, because firms pursue profit and rarely disclose how their algorithms reach conclusions.',
          'Therefore, governments must impose strict oversight to keep this powerful technology accountable to the public.',
        ],
        ja: '最後に、高度なAIは、ごく一部の人しか理解できないシステムの内部に重要な意思決定を集中させる。こうした技術革新は民間企業に任せるのが最善だと主張する人もいるかもしれない。しかしそれは当たらない。企業は利益を追求し、自社のアルゴリズムがどう結論に至るかをめったに開示しないからだ。したがって、この強力な技術を社会に対して説明責任のあるものに保つため、政府は厳格な監督を課さなければならない。',
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
        argument: 'equal access to higher education',
        sentences: [
          'First of all, free university education inevitably leads to far more equal access to higher learning.',
          'As tuition barriers fall, talented students from poorer families can also enter demanding academic programs.',
          'Sooner or later, a society that wastes such hidden talent will fall behind those that nurture it.',
          'This loss of human potential will become a serious burden on the entire nation.',
        ],
        ja: 'まず第一に、大学教育の無償化は、高等教育へのはるかに平等なアクセスを必然的にもたらす。学費の壁が下がれば、より貧しい家庭の優秀な学生も、要求の高い学業課程に進むことができる。遅かれ早かれ、そうした埋もれた才能を無駄にする社会は、それを育てる社会に後れを取るだろう。この人的潜在力の喪失は、国全体にとって深刻な負担となる。',
      },
      {
        argument: 'the economic power of a highly educated workforce',
        sentences: [
          'Secondly, widespread higher education strengthens the long-term economic power of the whole country.',
          'This is because educated citizens drive innovation and steadily raise overall national productivity.',
          'For example, countries such as Germany and the Nordic nations fund university education and remain highly competitive.',
          'This means that public spending on education returns to society as stronger and more sustainable growth.',
        ],
        ja: '第二に、高等教育の普及は、国全体の長期的な経済力を強める。これは、教育を受けた国民がイノベーションを牽引し、国全体の生産性を着実に高めるためである。例えば、ドイツや北欧諸国のような国は大学教育に資金を投じ、なお高い競争力を保っている。つまり、教育への公的支出は、より強く持続的な成長として社会に還元されるのである。',
      },
      {
        argument: 'the rising cost structure facing young families',
        sentences: [
          'Finally, free tuition eases the heavy cost structure that now discourages young people from raising children.',
          'It is true that such a policy would require significant government funding,',
          'however, this expense is far smaller than the long-term cost of an ever-shrinking population.',
          'Therefore, making university free is a wise investment in the country’s demographic future.',
        ],
        ja: '最後に、無償化は、いま若者が子どもを育てることをためらわせている重い費用構造を和らげる。確かに、そうした政策には多額の政府支出が必要だろう。しかしこの費用は、縮小し続ける人口がもたらす長期的な代償に比べれば、はるかに小さい。したがって、大学を無償にすることは、その国の人口動態の将来への賢明な投資なのである。',
      },
    ],
  },
];
