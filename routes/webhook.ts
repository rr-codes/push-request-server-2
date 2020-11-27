import express from 'express'
import {User} from "../models/user";
import {Installation} from "../models/installation";
import { SilentNotification } from "apns2";
import {apnsClient} from "../index";
import {parsePayload} from "../controllers/payload_parser";
import {getEnumKeyByEnumValue, HTTPStatusCode} from "../lib/utils";
import {EventCategory} from "../models/event";

export const router = express.Router();

router.post('/', async (req, res) => {
    const eventCategoryName = req.header('X-GitHub-Event');
    const guid = req.header('X-GitHub-Delivery');
    console.log(`webhook received: ${eventCategoryName} (${guid})`);

    const eventCategory = getEnumKeyByEnumValue(EventCategory, eventCategoryName) as EventCategory | undefined;
    if (!eventCategory) {
        console.log(`event category ${eventCategoryName} invalid`);
        res.sendStatus(HTTPStatusCode.NO_CONTENT);
        return;
    }

    if (eventCategory === EventCategory.installation) {
        if (req.body['action'] === 'created') {
            await Installation.create({
                installationId: req.body['installation']['id'],
                githubId: req.body['installation']['account']['id']
            });
        }

        res.sendStatus(HTTPStatusCode.CREATED);
        return;
    }

    const githubId: number = await Installation
        .findOne({ installationId: req.body['installation']['id'] })
        .map(installation => installation.githubId);

    console.log(`github id is ${githubId}`);

    if (!githubId) {
        console.error(`Installation with id ${req.body['installation']['id']} not found.`);
        res.sendStatus(HTTPStatusCode.NOT_FOUND);
        return;
    }

    const user = await User.findOne({ githubId: githubId })
    if (!user) {
        console.error(`User with github id ${githubId} not found`);
        res.sendStatus(HTTPStatusCode.NOT_FOUND);
        return;
    }

    const event = parsePayload(req.body, eventCategory);
    if (!event) {
        console.error(`Payload is undefined`);
        res.sendStatus(HTTPStatusCode.INTERNAL_SERVER_ERROR);
        return;
    }

    if (!user.allowedTypes.includes(event.eventType)) {
        console.log(`event type ${event.eventType} excluded.`);
        res.sendStatus(HTTPStatusCode.NO_CONTENT);
        return;
    }

    user.latestEvent = event;
    await user.save();

    for (const deviceToken of user.deviceTokens) {
        const sn = new SilentNotification(deviceToken);

        try {
            console.log('Sending APNS notification');
            await apnsClient.send(sn);
        } catch (e) {
            const message = `Error sending notification: ${JSON.stringify(e)}`;
            console.log(message);
            res.sendStatus(HTTPStatusCode.INTERNAL_SERVER_ERROR);
            return;
        }
    }

    res.sendStatus(HTTPStatusCode.OK);
})