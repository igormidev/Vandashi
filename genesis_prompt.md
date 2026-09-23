# The idea.
I want to create a youtube channel. I downloaded capcut and, even knowing it is one of the most easier video editors, I still hate the time the process of editing a video takes.

In my mind there is no way that AI could not help us to make this be faster.
So I searched for any tool that could help me in my jorney – but I did not found nothing aligned to what I wanted.
Most solutions here trying to plug in a AI to traditional video editors that have a mcp for that. But there was no product builted by ground with AI focus in mind (ai driven-editor).

So, I decided to build this tool to help me and other persons.
The main motivation was helping me in editing, but I think I can put other helpfull things as well that will accelerate my creative process – I'll mention later those features during this prompt.

This project is totally open-source and will be in my personal github.
And it will use my subscription of chat gpt for this with the usage of codex cli. This is allowed by open ai since I am using there harness and the app is just a "proxy" for there harness.

This app is especially useful for people that want to create dark channels, that are channels were you don't show your face.
Since those are more edit-heavy because the footage is basically the unique thing the user sees in the video since there is not a person, so good motion graphs and those kind of things are fundamental.

The name of the app will be: "Vandashi"

# General structure
The app will be heavily based in 2 things: Git and Ai chat.
The idea is that there will be multiple markdown files that have the "taste & creative judgment" of the user for all kind of things: How he likes tumbnails (and his style), how he likes scripts, how he likes the titles to be, how/when to use certain effects and those kind of things. Each one of those "taste" will be markdown or config yml files that will be able to he enhanced during the time so everything the proccess is better each iteration of the user and each time he needs to do less back and forth with the AI. Those markdowns are changed and then commited. The user can change them mannually but, mainly, it will be done by AI in the chat part.

## Git structure
This AI part will be mostly on the video part – that is a page that the user interacts with a project that is the videos.
Most markdowns are related to the video, but there are somethings that are related to the channel/brand and will apply to all the videos – like the style that the user likes to have the thumbnail or how he likes the edits to be done.
So, 
But the part of readme's edit will be in the hole app in almost every part.

I will explain more detailed in each section about each specific readme in this prompt, but I'll give you a overall idea now.
So, when the app is installed it will create a folder for the app to work.
The user when enters will enter to his last selected organization. A organization nothing more is then the channel/brand of the user.
The user needs to have at least one organization/project/channel/brand (I don't know the best name, I think the best option is "brand") to do anything in the app.
So when he does not have one yet the app will ask him to create, 
He selects a folder all the things will be saved there. I talk more about this in the "# Organization" part of this prompt.
So, with a "channel" folder selected, the system will imeddiantly create the first git repository there that will be a folder with the standard core markdowns.
Note: the ai will be able to edit the markdown of a lot of things related to videos; but there are editable markdowns with things that are not related to a single video but they are related to the channel/project as a hole.
And this folder will be called "brand_identity" and inside it will have a lot of readme. And this folder will be a git repository by its own.

As I said, the readme's inside here are about things that are above all the "videos".
Things hat are common to all videos (there will be readme's that are related to a video that is beeing produced/edited, but this is "global" to the project as a whole).
So, in the workspace will have basically:
- A readme about: How I like my titles to be wrote
- A readme about: How I like my short form description to be wrote
- A readme about: How I like my long form description to be wrote
- A readme about: How I like my thumbnails to be designed
- A readme about: How should be the visual identity of the channel that should be followed in image generations
- A readme about: How the #tags should be for long form videos (what works better in tiktok/instagram reals)
- A readme about: How the #tags should be for short form videos (what works better in youtube-like sites)
- A readme about: How I like the youtube video sections to be (those segments that the video timeline has in youtube so the user can know what section talks about what)
- A readme about: How I like scripts to be wrote for horizontal long-form videos (youtube)
- A readme about: How I like scripts to be wrote for vertical short-form videos (tiktok-like)
- A readme about: How I like the edits to be done with long-form videos (youtube)
- A readme about: How I like the edits to be done with short-form videos (tiktok-like)

The user will be able to change this all by manual change or by ai usage.
And this will be used when he is working with other videos.

So that is 1 git repository, and we can say that it is the main one for the whole operation.
But for each video that the user is editing, there will be a folder of that video and with readme's related to things of that video that I will talk later on this prompt in the video part.
So the structure of folders in the place the user selected to have the organization will be:
```folder structure
[organization_name]/
    brand_identity/
        brand_config.yml
        brand_icon.png
        ... all readme's "skill/memory" files
    shared_assets/
    videos/
        example_video_1/
            video_packaging.yml
            script.md
            thumbnails/
                main_thumbnail.png
                thumbnail_2.png
                thumbnail_3.png
            video_assets/
            clips/
                ...
        example_video_2/
            video_packaging.yml
            script.md
            thumbnails/
                main_thumbnail.png
                thumbnail_2.png
                thumbnail_3.png
            video_assets/
            clips/
                ...
        example_video_3/
            video_packaging.yml
            script.md
            thumbnails/
                main_thumbnail.png
                thumbnail_2.png
                thumbnail_3.png
            video_assets/
            clips/
                ...
```

For each change the AI does should be commited.
And the user will have the option in the chat to revert things that he did not liked by a arrow pointing back in the chat section with a "Revert last change" that will undo the change and the chat history. To reset the chat history deeply understand how the cli of codex works because it allows this – don't be lazy here. If it is not possible to be reverted by a point because the conversation up to that point does not exist any more show a toast error.

I will explain what is the `brand_config.yml` later on the "# Organization" section of this prompt.

# Tech stack and architecture
Now let's talk about what you will use.
The app will be done used typescript and react, with eletron to make the fronted.
There is a very specific reason for this architecture: we will use as reference other open source projects and those are the used in this open.

There will be no server. Everything will be saved locally. Most of them in the files of markdown/yaml and some other minor things could be saved with any local package to save preferences, configs or that kind of thing.

So, all the chat system will be based in T3 code that is a open source app that allows to use agents.
I want to have the best chat as possible since the app is heavly based in conversation with AI, so this needs to be a smooth experience.
Because of that, I want you to clone the T3 code repository in order to be able to use it as reference.
So, you should see how it does the integration with the cli of codex (remember, we are only having codex support initially).
See how it knows what are the models and thinking levels avaiable to we can have a similar architecture to display well the selector of models and thinking level.
You can clone the codex cli as well in order to see there codebase and understand how to do things that T3 does not do; like reverting the chat to a point (I think the trick is using the branch feature that we can create a branch based in any message so that branch chat branch in a older message will be the new chat, and this aligned with the git revert part will make possible to do what "Undo/Revert" feature I asked for, guarantee it works by testing).
But the main thing is: See how the chat itself works so we can replicate the max as possible. For instance; I like the way it shows the files that where edited when the ai stops running (there is the name of the file and I can click to expand) and I also like the way it shows the thinking of the AI to the user see's something while AI is working. Remember to show the option of increasing speed for models that support that.

Another thing: Guarantee that the user should be only able to let one AI running per time, so it does not become a mess.

## Linter and architecture
I want to have a VERY RESTRICT LINTER that FORCES things to have a ultragood arquitecture that is modular and VERY WELL DESIGNED.
Take a time to think in this before starting to code anything. See reference in internet about strict arquitectures that are good to mantain a cohesive folder structure and with good arquitectural limits that forces more files to have better segmentation if needed.
This is ULTRA MEGA IMPORTANT. This is the foundation. If this is not well done, the project will became a mess when expanding and having multiple agents working in features in it at the same time. So it is ultra important to guarantee this works without any issue.
Try to force that nothing can be commited in this codebase if there is warning or error in it (I don't know if this is possible, but, if yes, try to force this by a linter).
It should be trivial or easy for me to change, for example, where the files should be saved so if in the future I want to give the option for the user to save the files in my own server instead of the user pc (for instance to sell a subscription to use that cloud option that will allow them to have sync amoung other pc's workspaces). Or even to sincronize to github (this is a thing that I may want to do in the future, so this should be very easy to do and the architecture should be ready to support this if I in fact want to implement this in the future). Also ensure tests pass before commiting.
Also, the linter should guarantee that there is no hardcoded strings in the UI files since they should point to the translation variables since the app will be translated.

## Agent markdown file
Normally you already create a agent markdown files.
I just want you to add in that agent markdown that the agent markdown should be updated when somnething relevant changed in the architecture or something like that.
Mainly in the start. Also, give EXTREME emphasis (with capslock and texts that say that it is mandatory) to the linter and to follow the architecture and also to make good design with things that do not look like ai sloop and to always commit at the end and to ensure there is no static analysis error before commiting and to add relevant texts as I will say in and to run and guarantee that tests pass before commiting. And allways think in edge cases.

A very important case that you should have in the agent markdown is to always check if the component you are editing is used in other pages. If yes, see if everything will work without breaking everything. In case it is actually edited in more than one page, you, in your testing phase, should test it on that page as well to guarantee it continues to work as expected. This is useful because some features, like the asset page, are used in more than one page. 

## Tests
There SHOULD be tests allways for almost all task. But it is very important to not have bullshit tests that in fact Don't test anything meaningful.
It should be tests that will test in fact a logic and possible edgecases that could appear in the future – ultrathink in relevant things so we don't make bullshit tests.

## Pre-installs
- Hyperframes
- Hyperframes Studio
- Hyperframes Plugin
- Git (caso não instalado)
- Codex CLI (caso não instalado)

# Organization Listage ( UI )
This the UI where the user will be able to choose the channel we wants to work on. It will have the listage of all channels.
The most recently accessed will be the one on top. And there will be a option to add a new one, were the user will pass the process of 
By the way, this is the page that the user will see when he opens the app for a first time and has no organization created yet – there will be a UI that indicates that there is no organization created and a call to action to add one.
It will ask the user to select a folder where he wants to create the organization folder.
After the user selects that one, it will ask the name of the organization in a dialog. Only that field. And put a description that explains that it is the name of the brand and in the hint text of the textfield put something like "Ex: Your channel name" so the user understands that it is basically the name of the brand (that can include multiple midias). But don't make this dialog text heavy, as I mention in the "# UI" section of this prompt – everything should be light in text to not overload the user.
Then, it will go to the page of the organizaton.

# Organization Page ( UI )
This is the page of the organization.
This page will habe basically 3 tabs (same style of tabs of the video workspace that I'll talk later in the video workspace part).
The tabs are:
- Brand
    - Chat
    - Atributes
- Videos listage
- Shared assets

## Videos listage (second tab)
Should have all the videos the user had been working on.
The tab is basically the list page of videos that are associated with that channel, and the user can click on any one of them to go to the workspace of the video. It will navigate to that page of the video, where he can do the edits on the video or any other thing that he might want to do. That is the main page where he will spend most of his time.
This section is basic for him to see the list of all the videos. It will have:
- the thumbnail of the video, if the thumbnail is available
- the title of the video
- the video-theme description (only 2 lines with a " show more..." in the end that when the user clicks it will expand the card)
That will be basically the list tile. Make the ui look good. Get those data I talked about by the `video_packaging.yml`

## Shared Asset
Were the user will create the assets that will be present in almost every video.
It will have literally the same UI and structure described in "## Asset creation", so make sure that you follow it correctly. The main difference is that, while the "## Asset creation" section of this prompt explains how to add assets to a video only, this will add assets to the folder that has all the shared assets instead of a local video folder

## Brand page (first initial tab)
For the brand tab — It will be made basically of 2 sections in a row.
The section in the left will be the chat section.
The section in the right will be the listage of atributes of the brand.
The user can resize those windows by draging the mouse in the space between them (a indicator that it is draggable will appear in this moment, a very common ui pattern) and he can drag.
Cache those values for the next time the user in this page. The minimum is 25% for the page

The chat section is the same ui-like of the chat section that will be in the video page.
It initially starts empty without any when the tab is available the user can talk to change the atributes of the brand.
I'll come back later to this in this section.

Now, let's talk about the atributes section that will exist in the first tab, in the right of the chat section.
So, here the user will see all the fields related to his brand.
We will put a title to separate the following ones bellow (that will be the ones related to the `brand_config.yml`) and a title to separate them from the readme's.
- The brand title (probably the channel name)
- The brand theme description (what this brand is about, probably the theme of the channel and the topics it talks about in the videos)
- The image of the brand (Just visual, probably will be the logo of the channel)
Now the links.
Link of platform with long-form horizontal content:
- The link of the youtube channel and, optionally, in what browswer it is logged in
- The link of the odysee channel and, optionally, in what browser it is logged in
- The link of the rumble channel and, optionally, in what browser it is logged in
Link of platform with short-form vertical content:
- The link of the tiktok and, optionally, in what browswer it is logged in
- The link of the instagram and, optionally, in what browser it is logged in
- The link of the facebook reals and, optionally, in what browser it is logged in
- The link of the X (twitter) and, optionally, in what browser it is logged in
Those will be the variables of the `brand_config.yml`.
The title will be fullfilled with what the name the user had put when creating the organization.
Make sure it can't be less then 3 caracters never.

Bellow that "Brand atributes" section will be some tab's that the user can choose to click and visualize.
It will be the specific readmes about things.
The name of them will be:
- Title (short-form)
Will have a readme about how the user like's the title of short form videos to be.
- Title (long-form)
Will have a readme about how the user like's the title of long form videos to be.
- Description (Long-form)
Will have a readme about how the user like's the description of short form videos to be.
- Description (Short-form)
Will have a readme about how the user like's the description of short form videos to be.
- Thumbnail
How he likes the thumbnail to look like. The sytle etc.
- Visual Identity
What is the visual identity of the channel? This can be described here.
- #Tags (Long-form)
How the tags will be in long form videos.
- #Tags (Short-form)
How the tags will be in short form videos.
- Youtube Sections
How I want the AI to create the sections in the youtube timeline when uploading it to youtube.
Youtube has a feature to create sections of your video so the user knows what time to jump to if he wants to go to a section. Creating this sections helps in that sense.
- How I like scripts to be wrote for long-form horizontal videos
Examples of hooks I like, the way of writing and other taste based things for scripts of long form videos
- How I like scripts to be wrote for long-form horizontal videos
Examples of hooks I like, the way of writing and other taste based things for scripts of short form videos

Make each tab chip have a icon.
Bellow this tab chips will be a section with the readme of each one of them.
And the user can click to manually edit it and then click to save when done.
There should be a button to increase/decrease font and a shortcut as well that if clicked will reduce/increase font size.
Also give support for cntl-z.

In the moment the user edits any atribute of the `brand_config.yml` or he edits with any "guide readme" manualy there will be a save button in the bottom of the section that will basically commit that change. It will show a confirm dialog with the title/description of the commit and that commit will be generated by GPT 5.6 Luna in low thinking mode. And the user can edit the fields since the title/decription of the commit are editable (don't let them be empty). If a error happens with AI generation, continue to show the dialog but with the fields emtpy (this is a edge case that can happen). After he saves the button will show a disabled UI; since there is nothing to be saved. A very important thing: The AI CHAT should not allow the AI to work if there is any pending thing to commit by the user. The golden rule is: The AI should start to run with nothing to commit and when it ends it should commit everything (this commit should even be done programatically in the case the AI for some strange reasons forgets to commit, but let's make very clear in its instructions to commit everything, but we need this fallback of commiting after the ai stops to run). 

The readme's will be used in the video workspace, when the user is generating something that will benefit of that readme as context.
Example: The user want's to generate titles. And we insert as context the reference to the readme file in the pc and ask the ai to read it. So the prompts of AI should point to the readme. I will explain this in "# AI CHAT" part better.

## Other

A very important thing. When the user starts the project, please create a default readme for every single one in the organization page. So this way, the user already starts with something for each one instead of a blank page that will make him drop the app since it would be to overhelming to fullfill eveything.
This will not be generated by AI. It will be deterministic.
You will write each one of the initial readme's.
And for that create a agent with max thinking as possible and said for it to specialize to create a OUTSTANDING ULTRA GOOD STARTING POINT README. That will be a excellent starting point for the user that could edit it to be more "specific" for him, but it should not fell out of the box like a useless thing that need to be completly re-wrote. 
And to do that, as I said, ask the agent to specialize and search a LOT for that topic and never with old tipis since, for example youtube, the meta had changed for titles for example. Anyway, you can tell agent to see if there is popular skills already done. For example, probably for things like "long form video script" there is already a skill created by someone that could be analysed and incorporated to write our readme that, under the hood, is a skill as well that we will attach the path of it for the agent and force it in the prompt for the agent to open it. And, like all the other agents that you will create, attach this readme for it as well so it knows the "big picture".
Those skills files should be static const strings. Put all of them in one file so I can look to them and change mannually things If I think is needed later when the project is ended.
Base yourself heavly in the "## Video Pre-page" for when the user opens the organization, laod everything needed before starting — do the same check of ai that I mentioned in that section so we guarantee the user has access to AI — but the hyperframes part is not needed now, let that verification and other video-related verifications for the "## Video Pre-page" section.

So thats it. This is the channel page (or brand page, or organization page...).
Basically, a place were the user can edit things that are basic for all the videos and will be used in all videos workspace.
And he can then click in a video to continue editing it or create a new video project.

# AI Chat
This is probably the most fundamental part of the app. It should be extremely smooth and well-made.
It will be present in the Organization Page and in the Video Workspace page as well, appearing almost all the time in the left part of the page.
The idea is that the chat will have multiple tabs that represent the last opened chat that the user opened.
The tabs will be in the top and will go from the most recent to the oldest in a horizontal scroll way.
The user can click in the close button that will appear in the tab when it is hovered to close the tab.
By the way he can event close all tabs – an in that case it will show the iniital ui again.
The initial ui is just a centralized text explaning to the user that no chat is selected yet with maybe a icon/image above it to make ui better.

And here I will make a comment/instruction that will apply for the hole app:
Every form in the app will have a CTA to open a chat of that section.
And the chat will ALLWAYS continue from the past conversations, allways.
So it will be a continuous flow of conversation. But there will be a icon button in the chat to refresh conversation so its starts again if the user wants. But by default, if I open the chat that is related to "how I like titles to be wrote" it will go back to the same chat that was opened in the last time I want talking about that with it.
And ALL chats will be linked to at least one git repository (or almost).

Let's make the same standard of showing the same icon that represents the icon that will open the chat so the user can ask AI to change that thing. This is a little abstract; so let me give you examples. For each field/atribute/etc there will be the option of manually editing or opening a chat were we will be able to talk with AI so AI will edit it.
Example: the user is in the section of the title of video. It is a textffield that he can mannually type and save or he can click in that icon that will open the chat of conversations of title of that specific video and the AI will then be able to suggest the title and, if I want, it can change the title. There should be a dropdown were the user selects if he wants to only talk to ai to iterate or if he wants the ai to be able to effectively change the things. If the user asks to change and it is in read mode the ai should tell the user to change from the mode that only allow reads. But even in the mode that allow edits, the ai should not necessarily perform any changes – it should analyse the prompt and see if the user asked to perform any changes...
And here is the catch. In the system prompt you can tell the ai that it is a git repository and it should see the past changes (by git) if it think is relevant for having better context to achieve the given task OR if the user explicitly asked.

Now comes a other special thing: File Mentions.
In T3 code or chat gpt app we can refer to files with the "@". This should be valid here as well.
You see: I want to be able to reference other files. But the files "that will appear to refered" will change from chat to chat based on what is relevant for it. Also, I like the different icons used depending on the refered file that T3 code uses, use those icons and others.
Of course, the mentions will appear with a nice ui in the textbox but for the AI it will point to the path in the PC of the file, exactly like it is in T3 code, use it as reference.

By the way, handle error well. If you is not able to reach the cache of the conversation because codex erased it, just show a new conversation as well and a toast that the system was not able to find the last conversation – but don't show this the first time I am opening the app, because in this case you are creating the first conversation and not re-openning nothing. Ensure to be bug/error free.

Also don't forget to allow the user to drag files to the chat or click to select a file in the system. This is crucial for adding the video assets for example.

Now, let me give some more specific details about the "# Organization Page ( UI )" (that I did not ended explaning because I wanted to give you this chat context before).
So, all variablees in `brand_config.yml` should be 1 chat. We don't need 1 chat for each thing. And the icon that opens the AI chat should be near to the title of the section and not on each variable. This chat will only have the context of the brand_config.yml and the image of the brand. The user should be able to reference the `brand_config.yml` and all the other readme files from the organization page that are the readme files that the user can edit in this organization page and will be used in other videos. Make those files have a good name and with "_TASTE.md" at the end, like "TITLE_LONG_FORM_VIDEOS_TASTE.md" or "DESCRIPTION_LONG_FORM_VIDEOS_TASTE.md".
For editing the readme's, we will have a separated chat for each readme. So if the user is in the tab of the brand identity and clicks in the button to edit with AI it will open the tab of the brand identity – with the history if the user had past iterations as well, with the last message that I had talk with AI. About the @reference to other files: the user will be able to mention each one of the other readme's if he wants and also the `brand_config.yml` and the organization/brand/channel logo as well. So he can mention those if he wants for any context like "Write in the sytle of the @[MENTION_NAME] file". A nice touch is: Put a special icon and very distinct colors for each one of the readmes and the `brand_config.yml` and the organization logo. It will help to identify better. You can use other icon libraries that exist and are open source, don't limit yourself.

Now let's talk about the pre-prompt. You will make a prompt for each message that the user sends. FOR EACH ONE, not only the initial one because, as I said, the chat will not have reset, so that initial prompt could lose itself.
So, in a short, the FUCKING ABSOLUTE GOLDEN RULE FOR EACH AI CHAT IS: The prompt will start like a system prompt that will tell AI what it is and its objective (ex: "You are a professional thumbnail creator, you will help the user to create thumbnails for the user" – or course that you should write this better then me, its just a silly example).
Then, we will mention allways the same file in that system prompt (but of course, the user can mention others, this is just the starting point). We will have 2 categories of files mentioned in the chats: the mandatory files to read and the ones that is good AI to know that exist and that it can explore in case it think the context of it is relevant for the AI to have.
For the mandatory to read files it should be very explicit with capslock to give emphasis that the read of it is mandatory in order to have a better context. Also, one of those mandatory files to be read will be the one that the AI will effectively edit and work on (the file that is linked to that chat, the chat exists to edit 1 file mainly, and we need point to AI what is the emphasis file). Then, we will tell the ai that other files could be userfull depending on what the user asked for – so it is good to have in mind what they are; and then you can mention each file path (in the behavior that codex cli expects the file paths to be, be sure to audit this and guarantee that file mentions are in the correect way for codex) and a short description (1-2 sentences max) of what that file is about so the chat can know if it could be relevant to read for better context based on what the user is asking or not to be done. Also, the chat is strongly attached to a file as I mentioned, but this does not mean that you will necessarily NEED to change that target file, maybe the user is asking just a question and in that case no modification is needed. So make that it is ULTRA CLEAR what file the chat is created for editing, but say to it that, if the user asked, it can edit even other files if needed or can not edit nothing at all if the user did not ask for any explicit change. And of course, there will be the dropdown in the UI that the user can explicitly change for the AI to only read and not change nothing, and in that case the codex instance will be a read only instance. To end the system prompt, tell AI that it should commit everything in all git repositories that it acted on, in case any change is done – and that it is fundamental to not forget this and write good commit title/description. And then insert the prompt of the user and be clear that the past part was your guidance prompt and then comes the prompt of the user so AI knows were ends the "system prompt" and were starts the user prompt.


I'll give you a example of the "# Organization Page ( UI )" now. This is not a 100% how I want to be implemented prompt; it is just a idea but you should do some prompt engeniring to make it better.
So, for the `brand_config.yml` it is the only mandatory file to read.
And I will mention all the other readme files and also quickly mention the shared assets folder as well.
And I will pass by all topics mentioned above; that are:
- Identify the model and its purpose
- Tell what file it was created to edit (the file it has the ownership of)
- List the files that are mandatory to read
- Tell optional files that could be usefull depending on the context (bellow I will give example of just one, but you will list all readme's)
- Tell that not necessarily it will need to change files
- Tell that is okay to change files other than the main one (including the shared asset folder, and video asset folder in the case user is in the video workspace page – and don't forget to mention the part that if the ai will in fact need see the assets, it should see the metadata of description of the image and its title name).
- Tell AI that it can view old commits if it think will help with context (mainly with emphasis in the main file)
- Ask it to commit everything if any change was done
- Introduce the user prompt
In the case of the `brand_config.yml` edit chat, it will not have the part of "List the files that are mandatory to read" because only 1 is mandatory, that is the `brand_config.yml`. But in case there was more I would list the others that are fundamental to read in order to have a better context to do the task, but point after what is main one that it is attached to.
'''
System prompt:
```system_prompt.md
You are a influencer expert in all relevant media (youtube, tiktok etc...).
You will mainly assist the user in to edit his `brand_config.yml` that is a file, at location [FILE_DIRECTORY_LOCATION].
This file represents everything about the user brand and the social media that are linked to him.
You will help the user to edit this file based on what he wants. This is the main file you will be editing, it is MANDATORY that you read it before start to edit anything.

But be aware of 2 importants ponts:
- If the user message is just a question, in that case, you should just answer the question, and you don't need to do any edits in any file.
- The user might ask – you might see that it is relevant – to change another file besides the `brand_config.yml`, that is your main domain file. And you are allowed to follow that user request and change other files. You will still primarily work with `brand_config.yml`. However, if the user requests a change to another file, or if modifying another file is necessary to complete the task correctly, you should make that change as well. And some requests of the user could even not envolve the `brand_config.yml` at all by the way.

As I said above, should NECESSARILY read the `brand_config.yml`.

But, there are other files that you aren't necessarily required to read – but I will list them here with a short description and you can, based on the prompt of the user, decide if you think the context in it could help in a general understanding of what you need to do or could provide valuable context for being more aligned to the user "taste".
Those "optinal" files are:
- TITLE_LONG_FORM_VIDEOS_TASTE.md localized at [path_in_the_user_pc_of_the_localization_of_the_title_pref_markdown]. It describes how the user prefers the titles of his long form horizontal videos to be.
... [other readme files]

Aditionally, if the user talks about any asset you can check the global assets at the folder "[PATH_OF_SHARED_ASSETS]" (that the user can use in any video).
Guidance: If in fact you will take a look in the assets folder, please see the names of the files to understand what they are about but, more importantly, the description of them. Yes, all assets have a description in there metadata that describes what they are so you can have a better idea of it it serves what you are doing and if it is worth considering it. And if you add a new shared asset for any reason, please add a good description metatag.

More then that, you will notice that the files are in a git repository.
And because of that, if you judge that knowing the history of the recent changes in the `brand_config.yml` file could be relevant to achieve a goal, you can see the git history. You can see the titles/description of the commits to guide yourself better by the way.

You should mandatorily commit everything you did, not only what you did, but everything that is in the repositories that is still not committed. Create good texts/descriptions that are concise but describe well what is done because in the future a other AI might need to look to it.
```

Now, with all the context above in mind, I'll paste the prompt the user sen't so you can answer it in the best way possible.
User prompt:
```user_prompt.md
[INSERT_HERE_THE_USER_PROMPT]
```
'''

Thats it. That was a, close to end version, example of what I want in the prompt for the `brand_config.yml` (but you can enhance it a little if you think any other prompt engeniring could be done). Every chat will be attached to a file, and because of that each chat will have different prompt that depends on what scope that chat is. For the scope of brand_config it does make sense to tall about specific videos for exemple. In the rest of this prompt I will talk about how the other prompts should be but I wont enter in that much of details like I did in the `brand_config.yml` because I think you already got the idea to write the other system prompts – Just remember that all prompts will have all those bullet points that I listed above. 
By the way, in the video part remember to give emphasis to the shared assets and the video asset. Make a clear distinguition. If the user is asking for a thing and he does not said that it will be re-used in other prompts, the AI should be guided to add any asset that the user pastes in the chat or asks it to get from internet or other place in the asset folder of the video, not the global asset folder that is shared with all projects, but instead only in the local folder of the video. But if the user tell's that it will be used in other videos, then you can add it to the global asset folder (so let ai know in the system print that there those two types of asset folders). By the way, you should also guide in that system prompt that, if the AI is in doubt about whether it should add that asset to the global assets, it can ask the user. I think Codex has an option that questions the user if the asset should be added, or, even better, it should only put in the output a question asking if the user wants to add the asset to the global assets. By default, it will add it to the local assets of the video and ask the user if he wants to add it to the shared assets. If the user has already told you that he wants it to be in the shared assets, then the AI should add it directly to shared assets directly without asking the user.  Also don't forget to ref the brand image of the organization as well.

Let me talk a littel about the other system prompt of the other readme's of the organization page.
About the asset page in the organization tab, I already talk a lot about it in the "# Video Workspace Page".
or the chat of edit of `brand_config.yml` no file at all is mandatory. But you should mention all the other readme files and say that if the user asks, you can read the other readme's (but only edit them if the user explicitly ask for it).

About the readme's of the organization page that the user can change by mannual edit or by AI:
They should have the reference of the brand_config.yml and mandatory read. But of course that the main will be the thing it clicked to edit (ex: how titles of long form videos should be). As I said, should have a default readme.
Mention everything related to global asset as well similar to what I did in the example above (not video specific asset).
Mention the other readme's as well.
And give a little more emphasis for the shot-long variations (for the chats that have that dynamic of long-form and short-form difference, prompt of the long-form to say that exists a short-form readme of that should not be touched unless user says and that you are working with the long-form version, do the same thing in the opposite – because it is importanto for the prompt to know that there exists a different version of a readme for "the same area" but since it is a other format it should not be modified unless the user explicitly asks to).

By the way; I mentioned above that the AI should commit everything at the end in all git repositories that it changed (so if in a video repository it changed something in the "brand_identity/" folder it should commit what it did in the "brand_identity/" AND the video folder as well). For the most part, it will work, but we know that there is always the risk that AI hallucinates and simply forgets that. There should be a fallback in the sense that, after the system detects that the AI ended its run, it should then verify that all the files and all the repositories are committed.
If the user is in the workspace of the video, it knows that the brand identity space is above it, and because of that, it could change the brand identity file. It should check if the brand identity was changed and if the video repository was also changed, and see if everything was committed. If it finds anything that is not committed, it will then create a new instance that will be a cheaper instance for both repositories to create a commit. It will ask that AI to put a good title and description, and it should tell the AI to not change anything, just commit the changes. This is just for us to have a good commit instance.
Besides that, there should be a third fallback in case AI created only for commit, for some reason, has an error or ends its process, but you still detect that it is not committed. That could be the case if the user runs out of credits. Then you should do a commit yourself with deterministic text. It will not be an AI-generated title or description. It will be a deterministic title and description that maybe could mention the files changed or something like that.
This is an important use case to have handled because we always need to guarantee that everything is committed. More than that, this should be the default behavior when the user opens the app and chooses an organization. When I choose an organization, the first thing it should do is see if the organization file has everything committed. If not, it should do the same process of creating the instance just to commit. In the meantime, the user will see a loading. When it ends, it should verify again if, in fact, everything was committed, and if not, it should do the deterministic approach. And when the user enters the video workspace, it should do the same check again but now including not only the brand identiy folder but also the video repository itself (each video folder is a workspace). It is ultra important to mantain this consistency.

# Video Workspace Page
This is the page that the user will actively work on producing a new video.
It is the most complex page, you should ultrathink a lot and NOT be lazy to implement things.
There is a lot of hard features here, that a lot of require research before starting to write a singe line of code.
This page will have a appbar in the top, like the organization page – same style, with the difference that in the right the tabs will be:
- Packaging (short/long-form title, short/long-form description)
- Creation workspace
- Manual video editing
- Asset creation
- Clips creation
- Launch Suite
REMEMBER WHEN REVIEWING TO TEST MANUALLY TO OPEN EACH TAB OF THE APP AND TEST EACH ONE SEPARATELY.

Each page will have influence in a specific segmentation.
The "Clips creation" and "Launch Suite" should not be initially available since there will be no video to make a clip of and no video to be published... So show a disabled UI for them.

## Video Pre-page
This is the initial page the user will see before actually entering the page.
It will be composed by 2 parts:
- Validation
- Onboarding Form (in case is creating a new video)

Only then the user will in fact go to the video workspace suite.

### Video Pre-page: Validation
It will basically validate everything needed in order to make the page work.
By the way; I will list everything I remember but if during development you think in a thing that I had not mentioned here (a dependdency that needs validation or async preparation in order to laod dependencies) feel free to add it in this part.
This page will be basically a mix of loading and verification.
It will load every dependency needed (show a percentage so the user can have a idea of the total async dependencies that will be needed and how many were already loaded) and show a text for each one that is currently beeing loaded.
If everything is okay, it will end this loading phase and will go directly to the actual video workspace (or to the "Onboarding Form" if is a new project).

But it could happen that in the verifications it identifies that a dependency is missing and in that case it will stop the loading and show that error and asking the user to resolve that problem in order to continue. And it will have a button as well with a text like "Did you installed?" and a verify button (think in text and ui's better and more clear then this one).

The dependencies are:
- See if codex is installed
- See if the codex cli is working at all
I don't kow how... Maybe sending a "ping" message and see if the ai returns without a error? See the codex codebase if there is any way of first seeing if the user is loged in and if he has credits or subscription limits available and show a error if not.
- Guarantee that the hyperframes and hyperframes studio is installed in the PC correctly.
- Guarantee the hyperframe PLUG IN is installed for codex.
To be honest I don't knwo how to do this, but you can see the open source codebase of codex cli and see if there is a way of listing the plugins or something like this and seeing if it is installed (maybe even asking the codex cli directly if it is installed and asking it to answer only with "yes" or "no"?). The user needs to have it installed in order to be able to generate videos. This plug in is fundamental since we will explicitly ask in the prompts for the AI to use this plug-in when editing the videos. So we need to ensure it is installed.
- Guarantee that git is installed in PC correctly.
- Guarantee that the other dependencies are correct.
Probably I forgot to mention a dependency here that is necessary in a tab... So please add anything that I might forgot in this flow part...

By the way, we will not only show a blank error text to the user. We will have two buttons:
1. The button that I already mentioned is for the user to verify if it was fixed. By that, the user can try to install it by himself, do the process on his own, or even open another chatbot and ask to install. He only clicks to verify, and if now it is correct, it will then pass normally to the next phase. If the error continues, it will show a toast bar to indicate that the error continues, and it will go back to that same error page.
2. The button that we will have here is the one to perform the task with AI. For instance, if the error is that the hyperframes plugin is not installed in Codex, there should be a button that asks AI to resolve this. When the user clicks it, it will then open a chat bar component in the left section that will not exist initially. It will open that chatbot, and immediately it will input the message in the text box that gives the instruction for the user: for the AI to install what is needed. The user can only confirm with the send button and send it to the AI so it can start working.
This should exist for all the problems that could be corrected by AI, but of course some of them will not be able to be. In that case, the call-to-action button will be a little different. For instance, we will verify if the Codex CLI is installed in the first place. If it is not installed, then we cannot create a chat that will ask the AI to install it because it is not installed in the first place. In that case, the bot will just redirect the user to the OpenAI site that will teach how to install Codex.
Another example is if the user is not logged in to his account and does not have credits, or his subscription ended. We cannot ask AI to resolve that problem as well because the AI will not be working. In that case, we should also redirect him to maybe the pricing page of the subscription or something like that. But for the problems that AI can resolve, let's redirect him to chat to resolve without getting out of the app. The moment he clicks in retry and it works and goes to the next step, the chat section will disappear again.

This validation page should also see if everything is commited.
And if things are not committed yet, it should then commit automatically with that fallback system that I explained previously in this prompt. It will try to generate a title and description with AI, but if not possible, it will programmatically generate it and commit the same way, because we always need to have everything committed.
Entering the page of the video will also trigger a verification to guarantee everything is committed. This is very important. By the way, if you are not able to commit, you should display an error to the user. This is very important.
This will be awesome in the case that, for example, an AI was working in a process, and then the notebook of the user turned it off because it was without battery, and then he reset the notebook. In that case, the AI stopped it in the middle of a process. Let's say it was creating a script of the video, and because of that, the things were not committed.
When the user opens the app again and enters the workspace again, it will immediately check that (and commit everything). And by doing that, it will guarantee that everything is committed in the state it is currently in. When he opens that chat again of what he was working on before he had run out of energy, it will continue in the last chat he was in (same message), because, as I said, the chatbot states will always have the state of the last chat that the user had in that chat. This is ultra important to maintain consistency. And by that he can just ask the ai to continue what it was doing.

By the way, when opening the project make sure to check if all the shared assets are inside this project, because they should be and should be available in the chats. So if I create a new shared asset and I enter a video page it will be there because there is this validation to ensure all the assets of global are present in this asset folder.

### Video Pre-page: Onboarding Form
When the user just created a video project it will show this ui for him were he will be asked to input some basic things...
Basically: The aspect ratio of the video; if it will be horizontal (16:9), vertical (I dont know the expected aspect ratio of tiktok, please check and put it here). Only those 2 options will exist.
Show the icons of youtube/rumble/oddsey/etc in the horizontal option and the tiktok/etc for the horizontal/vertical option.
The option of picking the vertical will make that the "Clip" tab does not appear.

It will also ask what should be the video identification name. It should be clear for the user that this is not the title of the video, it is just to be the folder name and how it will be knows in the (don't allow special caracters that could break file names). This will be the name that appears in the organization page.

Those will be the things that will appear here.

## Packaging Page
Now, let's start with the first page that the user will see: The "Packaging" page.
This tab is were the user will work with everything related to packaging.
It will be similar to the organization page in the sense that there will be 2 sections: the left with the chat and the right with the fields that are modifiable. But there wont be a section for the readme's because they are in the organization level, not in the video level. But the user can refer to them when he asks the ai to change anything in the packaging of the video.
The packaging of the video will be a ".yml" file similar to `brand_config.yml` the but will be called `video_packaging.yml` and will also have a folder "thumbnails/" with the thumbnails created by the user that he can re-order an the first one will be the main one and the others will be for youtube to be uploaded in test A/B. The user can create how many thumbnails he wants. But the main one and the other firsts will be the only one used in the "## Video Release" section. The order of the thumbnails will in the `brand_config.yml` that will be edited and imediatlly saved when the user clicks to save by the manual save button that will also exist here (same thing of the organization page: I can manually start editing the things in the right section, but in the meantime, while I did not click the save button, I cannot use the chat. If I am currently using the chat to edit something, I cannot use the right part, that is, the manual edits. Of course, I can still see everything, but the text inputs, the buttons, and those kinds of things will be locked until the moment the AI stops running. There will be visual feedback by making the UI disabled, maybe with a lower opacity or something like that. Both the right section can lock the left section, and the left section can lock the right section.).
Beside the thumbnail edit (that will edit the folder of thumbnails also probably), all the other atributes that the user clicks to edit will edit the same `video_packaging.yml` file (the thumbnail will edit only the order of the thumbnail or add a new thumbnail, make the thumbnails have a name that is related to what exists in it and tell ai to update the name of the thumbnail if needed – also in the mannual part let the user mannually upload a image for the thumbnail).
So as I was saying, each atribute that I click to edit about the packaging of the video will open a chat that will basically edit the same file that have everything related to video. Please tell in the prompt about the existence of the thumbnail folder if needed and also about the existence of the "brand_identity/".

Each chat will have there "required to read markdowns". 
In the case of the chats here, all of them will point to the same `video_packaging.yml` since the info of everything is there (title, description etc).
The exception is the thumbnail that will point to the folder of thumbnails.
But besides that common read of `video_packaging.yml`, the chats will point to the readme that guide the AI of the user taste. Those are the readme's configured in the organization page.
For instance: the user can mannualy edit the title (and save after) of he can click to edit by ai that will open the ai chat of that variable and that AI chat will have in its system prompt a part that says that it is mandatory to read the readme that tells how he likes to write the titles of long-form videos. That should be the attached context.
And you should tell that if the user requires to change a thing in that readme of guidance the ai can change and it should commit (allways have everything commited in all repositories).
The packaging of the video envolves:
- Titles for long/short video (in the plural, because YouTube support A/B testing for titles)
- Description for long/short content.
- What should be the tags of the video for long/short videos (that in the yaml will be a listage)
- Thumbnail.

A important point about the `video_packaging.yml`: When the user enters the video workspace page it should verify if this file is correctly configured (I am saying this because there is a static structure that needs to be followed, a certain linter for how the variable names are called that we need to have well defined in the prompts). If it is not correct (because for some reason tche user mannualy opened the file and edited it) the system should see git history and revert to the last version that was aligned with how it should be. This is not a "AI" thing, it is a manuall logic process in the flow and it will be in the start of the page in the "Verify integrity of dependencies" part.

## Creation workspace
This is by far the most complex page.
This is were in fact everything will be done.
The user will spend most of the part of his time in this tab, so it needs to be ULTRA good in terms of UI and usage-loop that the user will have in it.

The idea that I have for editing is:
Everything will be based in the `script.md` of the video project.
This is the most important part ot get right.
If you dont get this right, everything follows apart.

The user will be able to edit mannualy the script of the video or ask the ai to do it.

The scructure of the page will be:
Basically, this page will be split in 2 structures (left and right).

In the right, only the preview of the video (the video player) that will be updated when the AI edits the video. If the user changes to "## Manual video editing", do some edits, saves, and changes back to this tab the player should be updated. So this video player will be allways up to date.
Bellow the video will be the list of commits that builded the video state to that point (a card listage).
The card should be paginted by 12 items per page. Only show the option to go next if there is in fact next commits.
Allways with title/description. When a new commit is added it should immediately update this list state and go back to the first page. 
The card should show the title and the commit and 2 lines of the description of the commit with a "load more..." at the end that when clicked expands the card to all the description.
In the same row were the title is there should be a button to copy commit SHA (so I can refer it in the prompt if I want). Also, it should show, bellow the description, all the files modified (same ui that T3 code uses to show diff) and the user can click to expand in a file row (that initially wil lonly show the file name and the diffs numbers and the expand icon at the end) to expand and show the changed (but will have scroll).

In the left section we will have a section of the page that will have a 2 tabs that the user can switch by:
- The script of the video.
- The chat with AI.

With the hole script that is a readme file.

The flow is:
The user can start to edit mannualy how the script will be (and in this case it is not commited yet — in fact it is not even in the file, only in the app state memory).
In the bottom there will be a row of buttons. They are:
- The reset icon button: Will reset the state of the textfield to the how the `script.md` currently is in the user codebase. Show a "disabled ui" when the content of the textfield is literally already the same of `script.md` (maybe you can see this by hash)
- Undo: Same funcion of controll-z, will undo the action (will work to undo the action the "reset" button btw). Show a "disabled ui" when there is nothing to be undone.
- Redo: Will undo the undone action. Show a "disabled ui" when there is nothing to be done with this action.
- Diff: A button that when clicked will show a dialog with the changes between the current version of the script and the current state of `script.md` in a file diff view, so the user can easly see what changed.  Show a "disabled ui" when the content of the textfield is literally already the same of `script.md` (maybe you can see this by hash).

In the total right of those buttons, but still in the same row, will be the save button. This button will be initially disabled and will be enabled the moment the user changed something (and now it is different form the `script.md`).
From this moment, you should lock the selection of the "AI CHAT" tab, the user can't go to that tab while there are things pendings in this script tab (only after the user does the flow of the save button OR resets by the reset icon).

Now, I'll explain what the save button will be:
It will basically open a confirm dialog so the user can confirm those changes and give it for AI to start acting on top of it. That dialog will show the DIFF of the script and the `script.md` and also a guide text that the user can, optionally, insert as context for the AI when making the task. In this dialog he will also select the model and reasoning level and then confirm.

When the user confirms the dialog will close and it will change to the chat ui with the message inputed and automatically sent to the AI the system prompt plus the optional comments of the user. So we will be able to see the tracking of the reasoning (while AI did not ended the edits, he can not go to the script tab — he should wait the AI end — we can't navigate in the app as a hole since the other pages are not accessable if AI is running).
After the AI ends the video that is synchronized, it will automatically be in the new version of it, and there will be a toast that indicates that the changes ended. The user will see, in the list of commits, the most recent commit that has the title and description, with a resume of what was done. By that, the user can play the video and see how the change was. 

This is the first flow: Make changes in the script file and then ask AI to implement the changes to be aligned to what the script is (the AI will see the changes by the diff and see what was added and try to implement that based on the timeline of the video).
Alternatively, the user can never touch the script and instead ask the AI to write a section for example by just chating with it in the prompt. He can ask the AI to use a asset since ALL ai chats (not only here) accept files and the AI will add the "video_assets/" folder.

By the way, the system prompt should be robust.
It DOES NOT need to be short, there is no problem in beeing bigger since there is a lot of things to get right here.
I will say by bullet points what the chat AI should have in its system prompt when the user edited the script and asked AI to do the iteration in the hyperframe to be syncronized with the video:
- Mention the `script.md` as it's main file to act on top and it should see the diff between the version that is now in staging (yes, make it be in staging but not commited yet) and the previous version so It can see what changed and 
- Mention the readme of how I like edits to be done. There are 2 variations of this readme; for long-form and short-form videos — attach the one based on "## Video Pre-page" (remember; mention the file and say that it is mandatory to be read)
- Tell it to use the hyperframe skill (I don't know how the prompt expects to use plugin mentions, I think it is with the '$' symbol but I am not sure — so check online)
- About the optional files, tell AI to know about all the assets that exist in the asset folder of the video and to use them if needed. Tell AI that it should (MANDATORY) read the metadata of all asssets; title, description and tags that could have something important. This is MANDATORY to read; mainly for the ones that the AI plan to use.
- Embedded the prompt of the user if existent — say to implement the changes of the script but also follow

Also, ensure the user can mention any of the assets of the video by the "@" in the textbox, and you SHOULD appear all the assets as options and while the user is typing it will start to filter the options (just use the T3 code chat system for this like evverything else)

By the way, the prompt should have variations/changes if I did the changes in the script or if I did asked AI to work directly without previous changes in the script. For that system prompt should, for example, put EVERYTHING in the script that he modified in the video — also ask it to follow the current structure of the script (If the user made the script separating things by section, then separate by scenes as well, for instance. It should try to follow the current style that the script is beeing wrote).
Also be VERY ULTRA MEGA CLEAR that for each asset that he ads in the clip it should be mentioned in the script like "Here the scnene opens with the [IMAGE_ASSET] appearing with a fade animation and a [BACKGROUND_IMAGE] as the background of the scene, the fade animation uses [FADE_ANIMATION_SOUND]" and you should mention this the same way that It would appear if it was the user mentioning a asset file (with the same way of writing the path, so there will be no distinction of a file mention of the user and the file mention made by ai).
By the way, this system prompt will mention the readme of how I like script to be wrote. If I selected in the "## Video Pre-page" that the video is horizontal, use the long form horizontal version of the readme of how I like scripts to be wrote when writing the script. Attached this markdown is not needed in the simpler way. Also mention the edit readme in the same way.

If the script have zero things yet and the user is asking you to create the initial version of the script you can insert in the prompt a good guidelines string that you will get by web researching internet and seeing what structure of script works better for scripts generated for hyperframes — this insert of string with "good pratices" should only be inserted when the `script.md` is empty and first time that it is beeing edited is by the CHAT section and not by user manual editing.

## Manual video editing
This page will basically be literally the "hyperframes studio" embedded in the app.
And it will be allways up to date with the current state of the video.
When the user enters this tab it should be up to date with the modifications done in "Creation workspace".
The reason this page exists is because the user will make the biggest part of the edits needed with the AI, but some final things could be done mannually by the user in a video editor — and since the hole editing process is done by hyperframes, nothing more natural that the mannual edits be done buy the already built in tool that is the hyperframe studio. Ultrathink to correctly embedded it until this application.
Also, it should be easy for me to ask to update the version if I want. So make sure to make a good arquitecture and maybe a reference readme about how to update this embedded component so when I ask to do this you will know how to do it (maybe create a skill for it is better then having a readme in the codebase — you decide).

When I am in this tab and I make any edit, when I click to change to any other tab, it should ask me if I want to save all the changes. It will be a dialog asking me if I want to save all the changes or discard everything. If I opt to save, then it will commit everything with an AI-generated commit title and description.
An important thing is that there should be a loading in this process. When I click to change the tab, it should have a loading that describes the changes. It will create the description and the title, and only after that will I be able to confirm. I will also be able to see the file changes if I want. I can click to expand. It will put the name of the files, and I can click to expand to see the diff.
In order to build a good UI for diffs, you should use the T3 code application as a base because it has very good visualization of diffs in Git. By the way, if, when I click to change the tab, the logic identifies that nothing had changed in the video project (no git change) you dont need to show any "confirm dialog ui" since nothing was done. Also, ultra important: this change should update the `script.md` if needed... So there should be a AI to edit the `script.md` to include those changes that can be GPT 6 LUNA with high thinking effort; DO NOT WRITE A LAZY PROMPT — the prompt should guide AI about what is the `script.md` and the reason for it to beeing updated (that is to be sincronized with he manual changes the user did).

## Asset creation
It will be all the assets tab were the user will be able to add new assets or delete assets from the video. It will be composed by 3 sections:
- Left: the chatbot so the user can edit/add/remove assets by talking with AI
- Middle: the gridview with all assets
- Right: the section that shows the info of the currently selected asset (currently will have a "blank" ui)
The user will be able to see all the assets of the project.
We will be able to filter the assets by type (video, audio, image) — it will be a checkbox and by default all are seleted.
This asset folder will be literally the asset folder of the hyperframe asset folder (there is a asset folder in hyperframe). This way we will have synergy with the rest of the codebase in the sense that when I add a new asset it will be already in the hyperframe asset folder ready for the AI to use it so we will not need duplicate nothing.
The user can drag a new asset to the folder of assets.
But there will be a option to add asset by selecting in PC (do a verification it is not a asset that is already in the project yet). By the way, there will be a a dialog with a loading after the user selects the asset and in that loading it will be running the AI model LUNA (cheap) to determine the name of the asset and the description of it and the tags it could have (ex: #background). This model will have access to the current tags that exist in his prompt but it suggest the creation of new ones. When the user clicks to save (after optionally editing anything; including tags) it will copy that asset to the asset folder and will add that title/description/tags to the metadata of the image — search how metatags works.
By the way, you should also have a filter of those tags. This filter will be generated when the user opens this tab because it will recursively look into all the assets that exist inside this folder. It will see the metadata of all of them, see the ones that have a tag, and map all the tags that possibly exist here.
By the way, if there is any folder structure here, you should respect that and show a folder structure as well. The user can navigate inside folders, but if he is searching by name, then you should not do this structure.
By the way, you should do a pre-mapping of all the assets so the search is very fast. Not only the titles, but also the descriptions, so the user can search for a description, and it will find it as well. 

Add in the left of this page the chat that will be attached to this folder and will be for the user to ask to generate assets for example (for instance, ask it to get a image or images of internet and add here like logos of brands etc...) and commit everything after adding.
This chat should have access to the `brand_config.yml` as contet and also the readme about the visual identity of the channel.

When the user clicks in a asset in the grid view of asset it shold show, in the right section of the page, the current selected asset. In that visualization section it will be a column with the visualization of the asset at the top: if video; the player to visualize it. If image; show it in the top with the option to copy to clipboard. If audio; show the player of audio with the wave forms... etc... Give support to gif as well and other visualizations that you might think...
Also show the tags; title and description and let the user mannualy edit any one of them (with the same save pattern that locks the chat of the other places) or ask the ai to edit any one of those atributes by the chat. It should be clear in the chat that he is editing a a asset and is in not in that broad AI chat that is the initial state of the chat.

## Clips creation
This page will only appear if the user selected that the video will be in horizontal mode.
It will help the user to create the clips of his long form videos.

The user will be able to clip the video in its current state.
It will create a new clip. The user can ask AI to create the clip as well like: cut from the second x to around second y. The AI will then not only add make the cut but also add new animations if needed or requested by the user. Buy the way, each cut will have it's own hyperframe project. The AI will be guided to see the assets and content of the original video and work on the clip with the reference of the user. Create a outstanding prompt for this. If the user asks to only edit the clip it should change only the clip, but he can make reference to the father original horizontal video (any asset of it or its animation, the prompt of the chatbot should now about the original video repository and this clip repository).

So the page will basically be:
A listage of all clips that when clicked will start to play in a vertical player in the right.
The user can click in a clips to go to a edit view of that clip that will still be inside this same video workspace tab, it will not be a different page. Only the body of the tab will change (like a inner navigation) to show the edits of the clip — the same UI will appear when the user clicks to create a new clip — but before having a form asking the user the aspect ratio (it can be tiktok ratio or square ratio that is best for posting in twitter/X) and title mandatory.
This form should take the hole tab space.

This "form page" will be similar to the "## Video Pre-page" but for the clips, so it will have loading and then the onboarding for the user to input the initial things like the aspect ratio as I mentioned and also the title. But, beside that, we will also show the video timeline with the selector in right and left so the user can select the area we wants to clip. And bellow that a textbox that will be the initial prompt of how the clip should be. So the structure is left and right section. The left section asks about the title and the aspect ratio, and the right side has the preview of the video. Below the timeline selector, the user will select and be able to see, in the player above, only the selected part and a frame of the aspect ratio that he selected, which he can use as a guide. It won't be used in anything related to the prompt, but it will be used as a guide.
Below the timeline, still in the right section, there is a text box where the user will be able to input the general guide for how this cut should be. The AI will then have the initial context to create the clip. After the user confirms, it will start the loading process, where it will create the repository. The user, in the meantime, will see only the thinking process of the AI, but he will not be able to interact with anything.
When it's done, it will redirect the user to the clip workspace page, where he will be able to work in that clip. The chat initially on that page will be exactly the chat that he was talking to within the first iteration prompt.
Now let's start about this prompt that will be the system prompt. I think we can do two types of prompts:
- By iterating in the edits
- The one that will, in fact, generate the first cut of the clip
For this first cut, you should guide it so that it is expert in making cuts and should use the assets that already exist, but be free to create other things. It should follow what the user is asking. More than that, I want you to attach the readmes for how he likes edits to be done in short-form videos.

In this "clip workspace page" we will have 3 structures:
- The left with the chatbot (will continue with the previous chat, including the one that started the hole clip)
- The middle with the title/description/tag etc... everything related to video packaging, a ULTRA MEGA SIMILAR UI to the "## Packaging Page" of the actual horizontal video — with the option to edit a atribute that change the chatbot to the atribute the user selected, but he can close that atribute and go back to the video editor that is the default chat were he asks the AI to create a clip.
- The right with a horizontal player of the current state of the video that will change once the user stars editing it.

## Launch Suite (Video Release)
This is the page were the user will in fact do the uploading.
I want to exist a config yaml file in the video folder that shows the launch status for all platforms.
Initially the user will see all platforms (is used originally selected vertical in the "### Video Pre-page: Onboarding Form", dont show the platform of vertical videos).
For the youtube, show the regular youtube and the youtube shorts (there is a icon for youtube shorts).

The user can click in any one of them.
The page will have 2 columns; the right and the left for long-form and short-form platforms, respectively.
The right, will be about the horizontal platforms.
List each option to this format.
Do the same in the left for vertical platforms.

For the horizontal column; it will show the status of the video (posted, currently beeing posted or not posted at all). And the link of the video that could be inputed by AI or not (the user can input mannualy by clicking pasting in that chatbox, and change the status of the video as well by a dropdown).
When the horizontal video is in status of not posted, there will be a button that the user can click to post.
If the user clicks in that button a inner page inside the tab will open with everything about that video (decription, title etc) that will be pull from the "## Packaging Page" and the user can edit it there before posting (there will be no AI chat here, everything local in ram while the user is in this page).
The user will need to fullfill the browser that the AI that has that social midia logged in in case he did not did this in the organization page (that the user can fullfill the link of the social media and the browser that it is logged in). And there will be a button for the youtube version of release that is named "Generate video section" so the AI can generate the sections with AI and then show it to the user.
And it will have a loading and then it will generate and show to the user that can mannualy change something if he wants (the manual change option will open a dialog with the whole video and the sections below, where the user can, in an easy-to-understand UI, set the points for each section. There should be a dedicated UI that will be in the dialog and will be opened if the user clicks to edit manually. The first iteration will be done by AI that will have the whole context of the video and the most important part of the script of the video).

When the user clicks to finally publish the video, it should immediately create a chat instance with a pre-inputted prompt that the user just needs to click Enter in order to start it. By that, if the user wants it, it will be clear that he can mannualy edit anything before sending the prompt. By the way, this prompt will not interfer in the system prompt. The system prompt should mention the ai to see the `brand_config.yml` file, see the name of the of the channel and tell it the link of the channel and in what browser it is already logged in. You should also guide the AI to verify if it is the correct YouTube channel that is logged in. If not, it should not take any action and should instead notify the user that it is the wrong account that is logged in. Of course, if the AI identifies that it can't change the channel, it should change to the correct channel and then perform the action. I said this for YouTube, but it should be the same for all the other platforms. The AI should be capable of identifying if it is logged in or not, and say to the user that, in that browser, that account is not logged in. It should ask the user to log in to that account. By typing the email and password, the AI can already fill in the login form, so the user can only input the things that are needed to log in to that account in that browser that he specified is logged in. Also the AI should be guided to update that yaml about the update state after it is done. Tell AI to babysit the video until upload is done. That is: it should click to upload the video course. Since this takes time, it should just sleep for some minutes and then go back when it sees it's ready. If it is not ready yet, it should sleep again, and it should do this until the moment it wakes up and sees that the video is, in fact, uploaded. In that moment, it should update the YAML to "uploaded". When it starts the uploading process, it can already change in the YAML that it is in the uploading process. The page of the user should be locked in while this is happening, so we is not able to use the app in that meantime.

Now lets talk about the short videos.
It will be quite similar. In fact, the most relevant change is that there will be a previous page. When the user clicks to upload a horizontal platform, it automatically assumes correctly that it is the main video that the user worked on. For short videos, we need to show all the clips generated and ask the user which clip he wants to upload.
If the user does not have any clips created, it should then say to the user that he needs to have clips created in order to upload. There will be two calls to action:
- For him to pick a video from his computer, in case he has one. This will be useful in the case that he only wants to upload a video.
- A call to action to go to the clips tab, where he will be able to generate those clips. He can click any one of them, and then he will be able to have a clip in hand.
After having a clip in hand and selecting a clip, he will then go to basically the same page with the same things. He will have the same UI where he will confirm, and by doing that, it will start the upload process.

# UI
The UI of the chat (mainly the text input part) will be very close if not equal to what exists in T3 code.
But the rest of the APP should expire at the UI of hyperframes studio, since we will have Hyperframes Studio Embedded in the app in this page (as I explained in the video workspace section). You should clone the Hyperframes Studio embed codebase since it is open frame and open source. You should see how its UI is built and the colors they use for default things and those kinds of things. Base yourself on that UI to build our own team data and reuse it. This way, when the user sees the Hyperframes Studio embedded in our app, he won't think that it is a strange thing because the UI is different, because it will be very similar. 

Also, feel free to generate images in some parts youthink could be good. It's a nice touch. By the way you will need to create the icon for the app, so thats a example of place were the image generation could be good. And mainly, I think in the landing page it will be great to use that as well.

By the way, I talk a little about this in the "# Landing page" part of this prompt but I want to give some emphasis here as well: normally, you add a lot of unnecessary text, like a lot of random subtitles in every part. I want the UI to be very light in terms of text, okay? Always prefer to put an icon with an "i" that represents an info icon. When the user hovers the mouse above, it appears with a tooltips that explain things better, so I prefer this approach of "tooltip and title" much more than you putting long descriptions. Don't add random bullshit, random text. That is a thing you do a lot,o where you add random sentences in the UI that don't mean anything or are completely useless.

By the way, the explanation dialogs of the tooltip do not need to be boring blank text in background... You can mix normal font style with font styles that are in bold or have an underline to give more emphasis. I want you to work a lot with those different types of text and mainly with this approach: having normal text and bold text in parts that you think are relevant. Don't throw this in the whole place of the app, okay? This is not what I am saying.
This will mainly be in tooltips, so you can give more emphasis to a part. You can maybe put some parts with different-colored text, but of course, do not write whole sentences in a strange green color. That is not beautiful; that is, in fact, horrible.
More than that, these dialogues could have an inner scroll if they are more complex and are explaining a more complex thing. They can have maybe an image to better illustrate it, with a PNG background or a transparent background. That is very important. If they don't have the transparent border, they can at least be rounded in the corners. If you think it's needed, you can even do some animations to better illustrate it. I don't know if this will be the case for any part that needs this. I think mostly images will be enough, but if you didn't find it, maybe a Lottie animation will be good for any part you can add as well. Just ensure when testing that they are not broken. 
Do not use generic icons for brands, search the icons of the brands like youtube/tiktok/etc and show there png icons were needed to ilustrate better.

A detail that I feel I need to tell about normally AI get's this wrong: Horizontal listages.
Some places will have horizontal listages – this is normal. Maybe a selector that, in case there is not enought horizontal space, could have a horizontal scroll. I don't have problem with that. I like that. My problem is when the padding of horizontal scrollables is not right in the sense that the padding in not in the INNER of the scroll – not around the scrollable widget, becaause when it is around the scrollable widget there is a padding in the left/right that is strange because the scroll has a hard cut because of the padding, when it should instead go all the way to the end of the app page or the component bound horizontal size. 
Add this in you agent or design markdown so it knows about this when writing horizontal listages it does do this approach that I don't like.


# Translation
The app will be available in other languages (the landing page as well).

But, ULTRA MEGA IMPORTANT: 
You should not even touch anything related to translation before you 100% finish the app.
Do everything in english. Of course, you can work on the structure of adding support for multiple languages. The scaffold is done, but do not actually translate anything yet until you end everything.
By the way: I understand that the hyperframes studio is probably not translated. Ok.

After you end everything, then and only then can you start the translation process. I am asking you this because I don't want you to bloat your context with translation things at the start. We can do everything in English, so you don't waste context with those translation issues, and only then can we start translating the app.

For that, you can create an agent, maybe for each language or something like that, with a brand-new context. You can even separate an agent to only work on certain tasks, so it has a more closed scope and does a translation that is aligned to what the page actually is, not a hallucinated translation. This is very important.

More than that, you should refer to this readme file so it has full context of what the whole idea of the app is, because it is very important to have this big-picture visualization in order to do translation that actually makes sense .

Now, I'll list the languages I want to have support.
For each language, do everything with cautios so the translation actually makes sense... Mainly for japanese/korean that expect Non-Latin characters.
Do now ask agents to rush just to end quickly. I do not want poor translations.
So, the list of languages we have support is:
- Japanese – Kanji (MAINLY KANJI) plus, if needed a little of Hiragana or Katakana (I don't understand about this language, so I don't know if only kanji is enought or not)
- French
- Spanish
- German
- Korean – Write in "Hangul (한글)"
- Brazilian Portuguese
- Italian

Another important point is to have a translation structure: where would these files be organized? This should be done in the part where you are deciding the architecture of the project before writing any line of logic or UI code. In that phase, you should also think about the structure of translation. When you start actually doing the translation for the language, this will already be done, so we will have a strong core and base scaffold that works and is ready if, in the future, we want to expand this to other languages. 

# Landing page
This landing page will be hosted as a GITHUB PAGE.
So search how github pages work.
Initially I don't have any own domain, so the url will be github site.
Give emphasis that it is open source and 100% free since it uses your claude subscription to make the edits.
You can even tag the codebase if you want.
Also add in the readme of the github of the project a link to the landing page.

By the way, this is the LAST thing that should be done. Only after the app is fully ended.
The reason of this is because I want you to use images of the app if you think it will be good (not mandatory, but if you think it could be good so then let's its good that the app is already done so we can take the prints).

By the way, you are very bad at design, and I already saw this by trying to create multiple landing pages in the past. The thing that you do most badly is that you create an overwhelming number of unnecessary subtitles: things that don't say anything to the user, don't pass anything to the user, and are just random bullshit text. You love to do this type of bullshit. Because of that, when you do this landing page, I want you to search the internet for good UI skills and use them. Of course, search for a skill that is mostly aligned to what we are trying to pass with our design system. You can be much more creative here then in the app that we follow the hyperframes identity for the app.

In the agent.md file you should should mention that if the AI did any structural change task (that for example changes the logic of how things are done) it should create a agent just to check the landing page codebase (that will be in the same folder) just to check if everything is fine or if something needs to be updated in order to be updated with what the current state of the app currently is. Mainly the app prints that maybe could be outdated after some change – so its allways nice to check.

The responsibility of the site should be perfect and widely tested among countless scenarios of screen sizes to ensure that we have good responsiveness and a good user experience for all sizes. Mainly optimizing for mobile and desktop, you should ultra think, see every single fucking page, and guarantee that nothing breaks in any size. Most importantly, think about whether, in fact, the UI on mobile is good or whether we should make modifications in order for it to be better. Do not be lazy on this part. Test and ultrathink, guarantee it is not generic as well.

The landing page should have translation based on the device of the user, but should allways fallback to english in case the language that the user browser expects is not supported by the languages we have.

# Responsibility
This is a desktop app. So we are thinking it to be used in desktop environment. So while we should handle responsibility for resized the page, there should be a minimum size that is 16:9 like and also with a minimum width and height that still handles well (like minimum of 1200px for width, something like this).
I think Windows and Mac allow us, as the owners of the app, to pass what the minimum size of the app has to be. Let's do this native configuration for Linux, Mac, and Windows to guarantee this will will be enforced by the app. 

By the way, the app will be available for Linux, Mac, and Windows.
Thats it.

# Final guidelines
I want to have a good readme that is easy for a human to read and understand when he see's the project in github.
It should have instructions about how to use the project and even a quick copy-and-paste prompt that the user can paste in his agent to clone the repository and put the app to run for the user, opening it for him to start using.
Add prints of the app in readme of the project – people today are quite visual.

Make sure there is zero static analysis error at the end and that you tested, by computer use, the features.

Review this plan every once in a while to ensure that you will not go out of track. This is MANDATORY. I am saying this because normally you jump somethings that I mention in prompts where I am trying to one-shot a product.
More then that, when you start compacting you start to lose track of the original goal and guidelines I talked about (ex: you start to forget the UI guidances and start to throw everything into cards and add useless subtitles in everywhere).
So, re-reading this prompt for each new section/feature you will start to work is a good way to mantaing this fresh in your context. By the way, every sub-agent should read this as well so it has a idea of the whole context of the project it is inserted in order to perform his task better and more aligned with the big picture (and here has usefull guides like to use T3 code and codex cli codebase as reference for implementation amoung other guidances).

DEEPLY ULTRATHNK for each feature of this app. DO NOT BE LAZY. THERE IS NO PROBLEM IF YOU BURN OUT A LOT OF TOKENS just don't do things in a hurry just to finish quicky and with low quality. For everything, ask yourself: 
- Is this easy to use or can I make the UX better?
- Am I adding bullshit UI things and not following the UI principles described in "UX" section of this prompt?
- Is there any usecase that I did not throught that can cause a bug or make the experience worse (and by that I can enhance that experience)?
- Am I literally following all the lints in this feature? Did I forgot any of them?
- Do I need to update any readme of arquitecture or other thing like that after a change I did?
- Is there any warning/error in the codebase?
- Did I added random bullshit text or made the UI text-heavy?

This part is MANDATORY. You should ask this before EVERY commit that you do. Because yes, I expect you to commit everything after each feature, section, module or relevant progress. And you shoud ask yourself this question allways and, only then, commit the code.

And the end of everything, push everything you did to github.
By the way, my github is logged in my cli and also in ARC BROWSER (the browser I use in this pc, I don't use chrome or safari).
So you can controll ARC browser by computer use if you need to do any manual dashboard configuration in githut itself for anything.

Take as many time you need to do this with quality. I don't mine if you take more then 20 hours to end at all. I just want quality, not speed.
So ultrathink about everything and perform this with max effort for every single task.
And test EVERYTHING mannually, every feature to ensure everything it is in fact working.
Every single integration.

This is a real project that will be used by multiple users — so we can not get this wrong because there are a LOT of people counting on us — so ultrathink for each thing to ensure we are not passing any potential flaws.

On the first page, where the user selects the organization, or inside the organization page, there should also be a settings page. When the user clicks on the settings, there will be an icon button that will be fixed in the top right of the page. It will open the settings. In the settings, the user will be able to change some things, like the language the app is currently in and other configs. The main thing that he will be able to do here is select the model that will be used for each operation that is kind of automatic under the hood. For instance, generating the title and the description of the commit: what should be the model used for that? The user can change it and change the thinking level as well, but the default will be the GPT Luna for each one of them, with thinking as medium (it for anything you think that high thinking be better, do it).
But for the chat you will allways mantain the last selected model by the user, the standard one will be astra 6 with medium thinking.

After you finished literally everything, I want you to make an instance with the most flagship model and the highest thinking level for each section of this README. For each section of this README, you should ask the AI to see the current codebase and see if everything inside each section was implemented or not. It will give you the main thread with feedback. If something is not done yet, you will then implement it. After you are done, you will not end the loop. You will ask that same instance for that same section again if now everything mentioned in that section is actually done: every single line of code is done, and more than that, if it follows the other conventions, like the architecture and the UI style that the app is currently using. Again, you will receive feedback. You should iterate in an endless loop that should not have a time to end. You should iterate until the feedback provided by this instance says that everything is well implemented and good, and more importantly, working. This should be tested. After it says that everything is okay, you will open the app and test if, after the changes, the feature is broken or not. This is very important. That will be the loop for each one of the sections. For instance, we have the section that talks about the organizational stage. You should enter this section and see if everything was implemented. For the things that were not well implemented, you should iterate. After you have done all the iteration, you should test to see if it continues to work, and you should do this for all the relevant sections in this prompt until the moment you guarantee that all of them were implemented without any issue and were revised by an independent instance and positively validated. Remember that the instance will not perform any changes. It is a read-only instance that will just guarantee that the whole functionality is implemented correctly. Align it with this original prompt. The main thing is: DON'T BE LAZY JUST TO END QUICKLY YOU IDIOT, IF YOU ARE LAZY I WILL CANCEL MY SUBSCRIPTION.