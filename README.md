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

## Agent Key

## Measures

### Dimensions of Mind Perception
https://doi.org/10.59477/jeps.594 
22-item scale, seven-point Likert Scale (1 = definitely not true, 7 = definitely true)


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
