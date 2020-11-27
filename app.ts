import express from 'express'
import mongoose from 'mongoose'
import { router as webhookRouter } from "./routes/webhook";
import { router as userRouter } from "./routes/user";
import {HTTPStatusCode} from "./lib/utils";

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const mongooseOptions = {
    useUnifiedTopology: true,
    useNewUrlParser: true
}

mongoose.connect(process.env.DB_URI, mongooseOptions).then(() => console.log('connected to database'))

export const app = express();

app.use(express.json());

app.get('/', (_, res) => res.sendStatus(HTTPStatusCode.OK))

app.use('/receive-webhook', webhookRouter);
app.use('/users', userRouter)
