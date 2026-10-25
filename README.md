# Sauxi.ai

## Start

Install Node.js 22 or newer, run `npm install` in this folder, then double-click **Start Sauxi.ai.cmd** (or run `npm start`). Leave its server window open and visit **http://127.0.0.1:4318**. Run `npm test` to check the local app.

For social-video links, install [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH. On Windows, the app also accepts `tools/yt-dlp.exe` beside its source files. [FFmpeg](https://ffmpeg.org/download.html) on your PATH enables audio merging and Wan reference trimming. These tools are installed separately and are not included in this repository.

The HTML file on its own can manage references, but AI generation requires the running local server. If you have saved avatars in the old file-based app, choose **Save project** there and **Open project** in the server-based app. Browser storage is separate for those two addresses.

## Generate

1. Connect your Siray API key and leave **Siray · Seedream 5.0 Pro Spicy** selected. OpenAI is optional.
2. Drop the avatar face or character sheet into **Image 1**, and the pose/scene image into **Image 2**.
   You can also paste a direct public HTTPS PNG/JPG/WebP image address into either slot and click **Import image URL**, or drag the link onto the image area. The app saves an actual copy in its local project; **Download copy** saves that source image to your computer. A Pinterest/Instagram post page is not itself an image address; open the image and copy its image address. Imports are limited to 20 MB.
3. Choose what to copy from Image 2 and add any optional identity or direction notes.
4. Click **Create with Siray**. The app builds a basic prompt locally from your settings and notes, then sends both images and the prompt to Siray without contacting OpenAI. For better specificity, choose **Build basic prompt**, edit it with visible details from the reference, then choose **Generate using edited prompt**.
5. Download the PNG. You can optionally select OpenAI to analyze the images and generate with GPT Image 2.5; safety rejections in that mode still fall back to Siray when connected.

For stronger identity consistency, the image side accepts up to eight additional views of the same avatar. Image 1 remains the primary identity, Image 2 remains the pose/scene direction, and Images 3–10 are supporting identity views. Seedream 5.0 Pro Spicy accepts 1–10 images per request. These views are saved in the workspace, exported with the project and image brief, and included when saving an avatar to the shelf. Changing Image 1 clears the views so unrelated faces are not mixed. OpenAI image editing also receives the selected views when explicitly chosen; adding views to an OpenAI analysis request increases its input size and cost.

OpenAI prompt analysis defaults to Standard (`gpt-6-luna`); select Advanced (`gpt-6-astra`) only when deeper analysis is worth the extra cost. OpenAI image rendering uses `gpt-image-2.5-sunburst`. Direct Siray generation and OpenAI safety fallback use `bytedance/seedream-5.0-pro-i2i-spicy`. Both references are supplied in order. The basic Siray prompt is a local template and does not inspect image pixels, so add specific visual details yourself when needed. The quality control applies to OpenAI; Siray uses a fixed documented resolution matched to the chosen shape. Image generation asks for confirmation before using provider credits.

API billing and model access are required for generation. Keys are held in local server memory, never written to project files or browser storage. Disconnect or stop the server to remove them. Optional existing `OPENAI_API_KEY` and `SIRAY_API_KEY` environment variables are supported. Requests send your images and instructions to the selected provider; OpenAI-mode safety fallback can also send them to Siray.

Projects include references, avatar shelf, the editable prompt, and the most recent generated output. Download outputs you want to keep before replacing them. A job can resume after page refresh in the same tab while the server remains running. If the server stops during a paid request, check API usage before submitting again.

The output card identifies which model generated the image. Siray generation requires a Siray key; the app cannot reuse an OpenAI key for Siray.

## Video Studio

Open **Video studio →** in the app, or visit `http://127.0.0.1:4318/video` while the local server is running. Choose from your Image Studio avatar shelf, its current identity or generated image, a saved project, or a dropped full- or half-body image. Then drop a 3–30-second MP4/MOV clip, or drop/paste a public Pinterest, Instagram, Facebook, or X post link. Dropping a link starts the import; after pasting, click **Load link for preview + prompts**. Once it loads, **Download source MP4** saves the imported clip, or you can watch it and build prompts without downloading it. The app retrieves the clip locally using yt-dlp, either from `tools/yt-dlp.exe` on Windows or from your PATH. Public post access is best effort; private, login-only, unavailable, long, or unsupported posts may fail. Some Pinterest Pins provide separate video and audio tracks; the importer merges them when FFmpeg is installed and otherwise uses the video track alone. **Build basic prompt** needs no OpenAI credits; edit it after watching the clip. Optional **Analyze frames with OpenAI** samples eight timestamped frames and uses Standard (`gpt-6-luna`) by default; Advanced (`gpt-6-astra`) requires explicit selection and confirmation. The edited prompt and current Extra direction are both sent to the chosen Siray video model.

To create a matching starting image, pause or scrub to a frame showing the desired full-body pose and outfit, click **Capture current frame**, then **Create still-image prompt**. The still prompt treats the avatar as Image 1 identity and the frame as Image 2 visual direction. **Use avatar + frame in Image Studio** transfers both images and the editable prompt; generate the still there, then return to Video Studio and click **Use current Sauxi.ai image** to use that result for motion transfer.

For video generation, connect Siray and choose Wan 3.0 Spicy, Wan 3.0 Prime Spicy, MiniMax H3 Spicy, Seedance 2.0 Spicy, or Seedance 2.5 Spicy. The server uploads a dropped or imported local clip to Siray-managed storage, then submits its HTTPS URL with the avatar image and reviewed prompt. Wan's 2–30-second **output** range is separate from its 15-second **reference video** limit. If a local/imported clip is longer than 15 seconds, Video Studio lets you choose a start time and trims a segment under 15 seconds before uploading it to Wan. The full original remains available for preview and prompt writing, but only the selected segment informs Wan's motion reference. A direct HTTPS MP4 URL is passed through unchanged, so it must already be no longer than 15 seconds for Wan. Other models retain their existing reference behavior. These models use the avatar image and motion video as creative references; they are not guaranteed to copy choreography exactly. Siray task submission and status responses may have top-level or nested task data; the app handles both and shows the HTTP status and available provider detail for actual rejections.

Wan 3.0 Spicy and Prime Spicy allow up to nine additional identity images after the primary avatar image, for 10 images total. Add front, three-quarter, profile, or full-body views of the **same** avatar in Video Studio's “More views” card. The app sends Image 1 first and adds a prompt instruction that the remaining images reinforce that identity while the reference video supplies movement. Replacing Image 1 clears the extra views to avoid accidentally mixing identities. Other video models continue to use the primary image only. More images may improve consistency, but the model does not guarantee an exact face match.

The generated MP4 is available to watch and download in the current server session. Download it before stopping the server. Keys remain in server memory and are cleared when the server stops. The Video Studio can use the current image from the server-hosted Image Studio or open a saved Sauxi.ai project exported from the file-only version.

Video API references: [Siray Wan 3.0](https://blog.siray.ai/wan-3-0-uncensored-video-api/), [OpenAI vision inputs](https://developers.openai.com/api/docs/guides/images-vision).

## API documentation

- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/reference/resources/images/methods/edit
- https://blog.siray.ai/seedream-4-5-spicy-vs-5-0-pro-spicy/
- https://docs.siray.ai/api-reference/task-status-image
