# LightGuide: competitor research and practical reuse

Reviewed 10 September 2026. Repository follow-up on the same date found the Android source on experiment/phase-0-ar-positioning at 5bc532b0d1bfd94f8f554867eec94e7403d1a7ce. See [source audit](../validation/AR_SOURCE_AUDIT_2026-09-10.md) and [delivery handoff](../engineering/CLAUDE_BUILD_HANDOFF.md). This is an implementation handoff and source-backed research snapshot. Recommendations below are proposed priorities; they do not change the repository architecture or certify hardware accuracy.

## What this means for development

Harden and resume the recovered Android AR experiment, use Google ARCore and manufacturer sensor libraries, and build LightGuide's capture/recreation workflow around them. Competitors provide useful workflow benchmarks and potential export imports. Their published product pages do not establish permission to reuse their internal code, equipment libraries or customer setups.

The application database and a research dataset have different purposes:

| Item | Purpose | LightGuide example |
|---|---|---|
| Application database | Stores the user's changing records | Shoots, saved setup snapshots, equipment, images and recreation outcomes |
| Research dataset | Supplies examples for development or evaluation | Images with known camera and illumination information |
| AR image database | Registers reference images for recognition | The exact reference and stand marker images used by the Android experiment |
| SDK or driver | Provides reusable software functionality | ARCore tracking or reading BNO086 orientation |

A dataset does not replace our application database. Building the core workflow does not require a large AI training dataset.

## Competitors and adjacent products

| Product | Verified overlap | Useful adaptation or integration | What is not established |
|---|---|---|---|
| Sidus Link Pro | 3D fixture positioning and live lighting control. Fixture reports include X/Y/Z coordinates and can be exported as a data file. | Later, investigate importing a photographer's own exported fixture report to reduce re-entry. Obtain a sample and verify format, units, axes and permitted use first. | The reviewed documentation does not demonstrate automatic physical stand measurement or measured return-to-position guidance. No reusable internal engine was verified. |
| set.a.light 3D | Virtual lighting simulation and exported PDF/JPG plans with positions, distances, equipment and camera/light settings. | Benchmark the content of our setup summary and recreation instructions; allow users to attach their own plans as references. | PDF/JPG output is not a verified structured import API. No licence to copy its simulation engine, product assets or community setups was verified. |
| Datacolor LightColor Meter | Bluetooth light/colour measurement, including simultaneous meters and continuous/flash measurement workflows. | Benchmark placement instructions, live readings and comparison between measurement locations. | Its calibration, flash performance and measurement quality cannot be assumed for our AS7343 assembly. No public reusable calibration dataset or SDK was verified. |
| PhotoRobot | Product-photography automation using presets and repeatable capture workflows. | Benchmark how a saved preset reduces repeated operator decisions. | Its controlled hardware workflow does not establish accuracy for a portable node on arbitrary stands. No reusable internal control software was verified. |

Sources: [Sidus Link Pro 3D Visualizer](https://help.aputure.com/en/sidus-link-pro/3d-visualizer), [set.a.light 3D](https://www.elixxier.com/en/set-a-light-3d/), [Datacolor LightColor Meter](https://www.datacolor.com/spyder/products/lightcolor-meter/), [PhotoRobot footwear workflow](https://www.photorobot.com/videos/footwear-photography-workflow).

Assessment: saved lighting plans and 3D positions already overlap with existing products. LightGuide's proposed distinction should be evaluated around capturing actual geometry and guiding a photographer back to it with measured feedback. The reviewed pages do not prove that this distinction is unique across the market; this is not a patent novelty conclusion.

## Software worth reusing

| Component | What it saves | Adoption decision and remaining work |
|---|---|---|
| Existing LightGuide Android experiment | Rebuilding the AR screen, marker registration, relative-pose calculation and target persistence | Reuse the recovered branch implementation. Address the source-audit gaps before physical trials; do not create another experiment. |
| Google ARCore Augmented Images | Writing a reference-image detector and pose tracker | Continue the existing approach. Use the exact registered images, verified print dimensions and suitable tracking states. |
| ARCore Recording and Playback | Repeating the same physical camera sequence for every software adjustment | Add when useful for repeated debugging. Recorded camera/sensor sessions can be fed back into ARCore; they do not substitute for independent physical accuracy measurements. |
| SparkFun BNO08x Arduino library | Implementing the BNO086 sensor protocol and reading orientation reports from scratch | Start with the manufacturer's examples, then adapt the ESP32-S3 wiring and report handling. SparkFun code is MIT; retain notices for included upstream work too. |
| SparkFun VL53L5CX Arduino library | Implementing multizone distance acquisition from scratch | Candidate for the ordered sensor family; confirm actual breakout and pin connections. Check bundled vendor licences when pinning the dependency; the full licence text was not successfully retrieved in this review. |
| Adafruit AS7343 Arduino library | Writing spectral-channel acquisition and sensor configuration | Use the official example for initial bring-up. Its BSD-style three-clause licence permits reuse with its conditions. Calibration and derived photographic measurements remain separate work. |

Sources: [ARCore Augmented Images](https://developers.google.com/ar/develop/augmented-images), [ARCore Android quickstart](https://developers.google.com/ar/develop/java/quickstart), [Recording and Playback](https://developers.google.com/ar/develop/recording-and-playback), [SparkFun BNO08x](https://github.com/sparkfun/SparkFun_BNO08x_Arduino_Library), [BNO08x licence](https://github.com/sparkfun/SparkFun_BNO08x_Arduino_Library/blob/main/LICENSE.md), [SparkFun VL53L5CX](https://github.com/sparkfun/SparkFun_VL53L5CX_Arduino_Library), [Adafruit AS7343 guide](https://learn.adafruit.com/adafruit-as7343-14-channel-light-color-sensor-breakout/arduino), [AS7343 licence](https://github.com/adafruit/Adafruit_AS7343/blob/main/license.txt).

Google documentation identifies its code samples as Apache 2.0 unless otherwise noted. That is not a blanket licence declaration for every ARCore binary or service. Pin exact dependency versions and retain their applicable terms during integration.

No driver was compiled or tested on the purchased board during this research. Libraries reduce implementation work; they do not establish compatibility of the entire assembled system.

## Datasets and assets

| Resource | Verified contents and licence | Useful LightGuide role | Priority |
|---|---|---|---|
| OpenIllumination | Object images under multiple illuminations, with camera parameters, illumination ground truth and masks. The publisher's dataset card specifies CC BY 4.0. | Later evaluation of image-based lighting analysis or inverse rendering. Preserve attribution and record the exact dataset version/subset. | Later; no core-workflow dependency |
| Poly Haven | HDRIs, textures and 3D models published as CC0 assets. Website/API access has separate terms. | Demo scene assets and controlled synthetic lighting examples, if a simulator or vision evaluation actually needs them. | Optional |
| Our own measurement sessions | Data captured using our phone, marker prints, node mounting and physical reference measurements | Establish whether our implementation achieves the agreed tolerance and can recreate a setup across sessions. | Required, but small and focused initially |

Sources: [OpenIllumination project](https://oppo-us-research.github.io/OpenIllumination/), [publisher's dataset card and licence](https://huggingface.co/datasets/OpenIllumination/OpenIllumination), [Poly Haven asset licence and access terms](https://polyhaven.com/license).

Neither public resource is a ready-made record of our ESP32-S3/VL53L5CX/BNO086/AS7343 assembly. They cannot establish sensor alignment, enclosure effects or real-world recreation error for that assembly. No directly reusable competitor dataset pairing physical stand geometry, our sensor readings, result images and recreation outcomes was verified.

## Existing work located in the repository

The follow-up branch audit found the actual Android implementation and exact marker assets on experiment/phase-0-ar-positioning at 5bc532b0d1bfd94f8f554867eec94e7403d1a7ce. The earlier conclusion that it was only local was incomplete. The current baseline now incorporates that source; detailed provenance and remaining defects are in the source audit.

The recovered printing instructions document historical marker-orientation problems and revised landscape assets. The validation log still marks the complete accuracy/relocalisation trials as planned. Preserve prior observations while collecting the missing evidence; do not rebuild the same experiment.

ARCore Augmented Images uses registered image features. An arbitrary printed square, QR code, ArUco marker or AprilTag is not automatically interchangeable with those images. Switching to another detector would be a software change. For moving stand markers, distinguish current image observation from an inferred pose after the image leaves view. [Google's image-tracking requirements](https://developers.google.com/ar/develop/augmented-images).

The agreed 3 cm threshold remains a target. Check the remaining product question with controlled physical reference measurements: save a position, restart/relocalise, move the stand, follow guidance, and compare the final position with independently measured truth. Include tracking loss and recovery. Record failures and error distribution; a successful camera-tracking indicator alone is insufficient.

## Implementation order for the coding handoff

1. Harden and reuse the recovered Android source, registered images and print instructions. Follow the source audit instead of rebuilding the app.
2. Complete only the missing measurement/recreation evidence using that implementation. Use ARCore playback if repeated software debugging warrants it.
3. Bring up each purchased sensor using the official example, then integrate readings behind LightGuide's sensor interface. Confirm actual breakout identities and board pin mapping.
4. Build the agreed offline capture, save and recreation screens against the documented data model; retain clearly labelled mocks until live interfaces are ready.
5. Investigate a Sidus fixture-report importer only after obtaining a representative export and confirming that users need it. Do not make it a dependency of the first usable journey.
6. Evaluate OpenIllumination or synthetic scenes when a concrete AI evaluation question exists. Do not begin a large training-data collection project now.

## Monitoring status and research limits

The existing automation **Track LightGuide landscape** was confirmed enabled with a monthly schedule on the first day, using Europe/London time. Its recorded last run was 1 September 2026. It covers competing measurement, setup capture/recreation, spectral measurement, positioning guidance, AI adaptation and relevant patent developments. This review did not create a duplicate task or change its schedule.

This research reviewed public primary product documentation, manufacturer libraries and publisher dataset pages. It did not access competitors' private databases, validate their internal architecture, install their paid products, compile candidate dependencies or perform physical accuracy tests. Public feature descriptions support the comparisons above; integration benefits and priority choices are our engineering assessments.
