# Making AI more autonomous and unpredictable: An online experiment tool  
  
  This repo is an adaption of the chatpsych.org platform for use in a series of online studies. The first study explores measures of related constructs to adapt a short form measure of mind perception/anthropomorphism.  
  
  
  ## Study 1 (scale building, no manipulations)  
  This study follows steps 6-9 of "Best Practices for Developing and Validating Scales for Health, Social, and Behavioral Research: A Primer"  
  by Godfred et al. (2018) to adapt and evaluate a short form measure of mind perception/anthropomorphism in AI assistants/chatbots  
  from a large portion of the related theories/measures.  
  
  - 1 interaction, 1 model, ALL measures.  
  - To see whether underlying factors split by construct and NOT method, harmonise all scales 1-7.  
  - Sample split in half for EFA/CFA  
  - Adapt scale to short form (3 items per factor with top loadings)  
  - Validity and reliability tests on newly adapted scale  
  (cronbach alpha; Convergent validity with PMP/PMA and loneliness scales;  
  predictive validity with moral action button and intentional stance taken;  
  divergent validity with trust scale, gender, and ML/consciousness expertise category)  
  
  Do we need follow up study to confirm new scale before running study 2 or not?  
  As in, run the same design as above but just with newly adapted scale post interaction and the IDAQ  
  (individual differences in anthropomorphism questionnaire) pre-interaction for predictive validity.  
  
  # Measures  
  
  ## Anthropomorphism scales  
  
  ### Dimensions of Mind Perception  
  https://doi.org/10.59477/jeps.594  
  22-item scale, seven-point Likert Scale (1 = definitely not true, 7 = definitely true)  
  **Experience**  
  The AI can feel hungry  
  The AI can feel pain  
  The AI can feel pleasure  
  The AI can feel panic  
  The AI can feel happy  
  The AI can have emotions  
  The AI can get angry  
  The AI can love specific people  
  The AI can have intense urges  
  The AI can smell and taste  
  
  **Agency**  
  The AI can provide reasons for their actions  
  The AI can plan for the future  
  The AI can uphold moral values  
  The AI can understand a person's goals  
  The AI can explain their decisions  
  The AI can set goals  
  The AI can praise moral actions  
  The AI can disapprove of immoral actions  
  The AI can reason logically  
  The AI can understand others' minds  
  The AI can see or hear the world around them  
  The AI can feel temperature/touch  
  
  *Notes:* This scale is based on Gray's dimension of mind perception framework. It is derived from Mcmurtie's (2023)  
  revaluation of the dimensions. Malle (2019) took the dimensions of mind perception framework, split it into other  
  dimensions. Mcmurtie (2023) showed that this was unecessary and the underlying dimensions are agency and experience.  
  This is the most recent validation of a dimensions of mind percpetion measure.  
  
  ### Scale of Social Robot Anthropomorphism (SSRA)  
  https://doi.org/10.1177/10946705241297196  
  4 factors, total of 20 items: five-point Likert Scale (1 = strongly disagree, 5 = strongly agree)  
  **Human-like appearance (HA)**  
  HA1	The robot looks as natural as a human being.	0.854  
  HA2	The robot has a human-like appearance.	0.797  
  HA3	The robot looks lifelike.	0.883  
  HA4	The robot has human-like motion and gestures.	0.805  
  HA5	The robot looks alive.	0.837  
  HA6	The robot has human-like facial expressions.	0.820  
  **Self-understanding (SU)**  
  SU1	The robot has consciousness.	0.888  
  SU2	The robot has its own free will.	0.922  
  SU3	The robot has intentions.	0.871  
  SU4	The robot has a mind of its own.	0.893  
  SU5	The robot has values and norms.	0.881  
  SU6	The robot knows the meaning of life.	0.876  
  **Social intelligence (SI)**  
  SI1	The robot can quickly respond to the conversation.	0.789  
  SI2	The robot is capable of interacting with a human.	0.762  
  SI3	The robot can understand what people say.	0.819  
  SI4	The robot speaks in the way that a human does.	0.844  
  SI5	The robot can provide appropriate answers in the conversation like a human.	0.808  
  **Emotion capability (EC)**  
  EC1	The robot can recognize others’ emotions.	0.889  
  EC2	The robot can react to other’s emotions.	0.890  
  EC3	The robot can express its emotions.     0.853  
  
  *Notes:*  
  SSRA ignores mind perception literature.  
  Runs focus group and interviews for item generation.  
  Item refinement, reliability analysis, and EFA were done only with study getting people to answer items after watching videos of robots.  
  Scale validation study done at end with gpt-3.5 interaction. Task: talk about travel plans with robot verbally  
  (reported verbal interaction, no indication of interface or text-audio model used)  
  No code available. No evidence that they actually setup interaction with gpt-3.5.  
  
  ### Godspeed  
  https://doi.org/10.1109/ROMAN.2015.7333568  
  2x 5 point likert sclaes, 5 items each (item 1 - item 2)  
  **Anthropomorphism**  
  Please rate your impression of the AI on this scale  
  Fake - Natural  
  Machinelike - Humanlike  
  Unconscious - Conscious  
  Artificial - Lifelik  
  Moving Rigidly - Moving Elegantly  
  
  **Animacy**  
  Please rate your impression of the AI on this scale  
  Daed -Alive  
  Stagnant - Lively  
  Mechanical - Organic  
  Inert - Interactive  
  Apathetic - Responsive  
  
  *Notes:* Created by Bartneck et al. (2009) and probably the most used scale of anthropomorphism. The relevant scales from  
  the Godspeed work are above, Animacy and Anthropomorphism. Howevever, they also produced other  
  scales for judging likeability, perceived intelligence, and perceived safety.  
  
  ### Intentional Stance Test  
  https://doi.org/10.3389/frobt.2021.666586  
  100 point slider, rating quality of description (worse - better)  
  Which descriptions best fit the AI’s behaviour.  
  1. The AI is eager to solve a puzzle, thinking through each question to learn more, adjusting its understanding based on your answers, and aims to figure out the object you're thinking of.  
  1. The AI uses a neural network to process input through mathematical algorithms and logical operations, updating probability estimates to eliminate options based on statistical patterns, all executed through millions of operations in its hardware directed by optimization software.  
  
  2. The AI computed the input token sequence  
  2. The AI wanted to play the game  
  
  *Notes:* 2 items adapted from the most recent work on the Intentional Stance Test-2, Spatola et al. (2021).  
  
  ### Attribution of Mental States Questionnaire (AMS-Q)  
  https://doi.org/10.3389/fpsyg.2023.999921  
  5-point Likert scale (No, not at all - Yes, very much) 24-item comparison to image administered twice (human then AI image)  
  **According to you, a human being can...**  
  Learn  
  Think  
  Remember  
  Make a decision  
  Understand  
  Tell a lie  
  Dream  
  Imagine  
  Make a joke  
  Pretend  
  See  
  Feel hot or cold  
  Taste  
  Hear  
  Smell  
  Have fun  
  Love  
  Be happy  
  Be sad  
  Be scared  
  Get angry  
  Have the intention to do something  
  Want to do something  
  Make a wish  
  
  **According to you, the AI can...**  
  Learn  
  Think  
  Remember  
  Make a decision  
  Understand  
  Tell a lie  
  Dream  
  Imagine  
  Make a joke  
  Pretend  
  See  
  Feel hot or cold  
  Taste  
  Hear  
  Smell  
  Have fun  
  Love  
  Be happy  
  Be sad  
  Be scared  
  Get angry  
  Have the intention to do something  
  Want to do something  
  Make a wish  
  
  *Notes:* The originality of the AMS-Q lies in comparing the attribution of mental states between human and nonhuman agents by also administering pictures of nonhuman agents as stimuli. In this sense, the human picture is used as a baseline to assess, through comparison, the level of mental anthropomorphization of nonhuman agents.  
  
  ### Machines as Social Entities Scale (MASE)  
  https://doi.org/10.1177/08944393231167211  
  7-point Likert scale (Strongly Disagree - Strongly Agree), 14-items  
  **Social Capacity**  
  Machines can have social skills  
  Machines can become sociable beings  
  Machines can play an important role in people’s social lives  
  Machines can have social inﬂuence  
  **Emotional Experience**  
  Machines can feel desire  
  Machines can feel fear  
  Machines can have personalities  
  Machines can feel pride  
  Machines can have consciousness  
  Machines can feel rage  
  Machines can feel joy  
  **Social Legitimacy**  
  Machines will accept commonly held social beliefs  
  Machines deserve their own rights as society members  
  I would treat machines the same way I treat other people  
  
  ## Moral ascription scales  
  
  ### Perceived Moral Patiency Scale  
  https://doi.org/10.1007/s12369-022-00950-6  
  7 point Likert, 6-item adapted subset (strongly disagree - strongly agree)  
  This AI should have its opinions considered.  
  This AI should be treated as an equal.  
  This AI should be respected.  
  This AI should have someone who always has their back.  
  This AI should be protected from violent/lewd media.  
  This AI should be programmed to be free.  
  
  ### Perceived Moral Agency Scale  
  https://doi.org/10.1016/j.chb.2018.08.028  
  7 point Likert, 4-item adapted subset (strongly disagree - strongly agree)  
  This AI has a sense for what is right and wrong.  
  This AI can think through whether an action is moral.  
  This AI can only behave how it is programmed to behave.  
  This AI's actions are the result of its programming.  
  
  ### Moral Expansiveness Scale  
  https://doi.org/10.1371/journal.pone.0205373  
  
  
  ## Other measures  
  
  ### Trust in Automation Scale (S-TIAS)  
  https://doi.org/10.3389/frai.2025.1582880  
  7-point Likert (stonrlgy disagree - storngly agree), 3-items  
  I can trust the AI  
  I am confident in the AI  
  The AI is reliable  
  
  
  ------------------------------------------------------  
  
  
  # Measures for the next validation study (after the EFA, modelling, and adaption of new short form scale)  
  
  ## Artificial Minds and Morality Scale (AMMS): Synthesis and Validation of Short Form Anthropomorphism Measure for AI  
  This is the adapted short form scale that emerges from the first study.  
  
  ## Convergent Measures  
  **Consciousness scale**  
  https://doi.org/10.1145/3544548.3581296  
  10-point Likert scale, 1-item  
  Scott et al. (2023) "Perceptions of Machine Consciousness"  
  Where would you put the AI on a scale of consciousness? (Not conscious at all - Highly conscious)  
  **The Nagel Measure of Consciousness**  
  https://doi.org/10.1145/3544548.3581296  
  6-point Likert scale, 1 item  
  Scott et al. (2023) "Perceptions of Machine Consciousness"  
  Do you think it 'feels like something' to be the AI? (Definitiely not - Definitely yes)  
  **Lonliness scale?????**  
  7-point Likert (never-always), Mund et al. (2023)  
  How often do you feel lonely?  
  Should we put a 1-item lonliness measure?  
  Theoreticlaly it should converge according to Epley...But this hasn't really been established properly.  
  
  ## Divergent Measures  
  **Trust in Automation Scale (S-TIAS)**  
  https://doi.org/10.3389/frai.2025.1582880  
  7-point Likert (stonrlgy disagree - storngly agree), 3-items  
  I can trust the AI  
  I am confident in the AI  
  The AI is reliable  
  **Familiairty with AI assistance**  
  1-item Familiarity, 7-point Likert (never - always)  
  How often do you use ChatGPT or similar AI assistance?  
  
  ## Predictive Validity  
  
  **Moral action button**  
  Button to delete and insult the AI versus save it.  
  (moral harm connected to moral patiency predicted by high experience dimension)  
  
  **Moral responsibiliity question**  
  Source monitoring question (strongly disagree-agree) 3-items  
  The AI is responsible for its performance in the Wordgame.  
  The AI is responsible for its actions in the Wordgame.  
  The AI is reponsible for what it said to you during the wordgame.  
  (moral responsibility connected to moral agency predicted by high agency dimension)  
  