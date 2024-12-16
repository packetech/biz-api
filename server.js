const express = require('express')
const { generateApiKey } = require('generate-api-key')
const { db } = require('./firebase')
const app = express()
const PORT = 1337
require('dotenv').config()

//Variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SK 
const stripe = require('stripe')(STRIPE_SECRET_KEY)
const DOMAIN = 'http://localhost:1337'
    //const DOMAIN = 'https://apibiz.netlify.app'


//middleware
app.use(express.static("public"))


//routes
app.get('/api', async (req, res) => {
    //receive API Key
    const { api_key } = req.query
    if (!api_key) { return res.sendStatus(403) }
    res.status(200).send({ "message": "You can do it I believe in you! Don't give up yet!" })
})

app.get('/check_status', async (req, res) => {
    const { api_key } = req.query
    const doc = await db.collection('api_keys').doc(api_key).get()
    if (!doc.exists) {
        res.status(400).send({'status': "API Key does not exist"})
    } else {
        const { status } = doc.data()
        res.status(200).send({'status': status })
    }
})

app.get('/delete', async (req, res) => {
    const { api_key } = req.query
    const doc = await db.collection('api_keys').doc(api_key).get()
    if (!doc.exists) {
        res.status(400).send({'status': "API Key does not exist"})
    } else {
        const { stripeCustomerId } = doc.data()
        try {
            const customer = await stripe.customers.retrieve(
                stripeCustomerId,
                {expand: ['subscriptions']}
            )
            let subscriptionId = customer?.subscriptions?.data?.[0]?.id
            stripe.subscriptions.del(subscriptionId)
        
        } catch (err) {
            console.log(err.msg)
            return res.sendStatus(500)
        }
        res.sendStatus(200)
    }
})

app.post('/create-checkout-session/:product', async (req, res) => {
    const { product } = req.params
    let mode, price_ID, line_items

    if (product === 'sub') {
        price_ID = 'price_1QHOlVLzY6sGa9nmIAWQFQGX'
        mode = 'subscription'
        line_items = [
            {
                price: price_ID
            }
        ]
        quantity_type = 'subscription'
    } else if (product === 'pre') {
        price_ID = 'price_1QHOY1LzY6sGa9nmcGQkI5mf'
        mode = 'payment'  
        line_items = [
            {
                price: price_ID,
                quantity: 1
            }
        ]
        quantity_type = 10
    } else {
        return res.sendStatus(403)
    }

    const newAPIKey = generateApiKey({
        method: 'string',
        min: 20, 
        max: 25,
        pool: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.*_~$%^@!'
    })
    const customer = await stripe.customers.create({
        metadata: {
            APIkey: newAPIKey
        }
    })

    const stripeCustomerId = customer.id 
    const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        metadata: {
            APIkey: newAPIKey,
            payment_type: product
        },
        line_items: line_items,
        mode: mode,
        success_url: `${DOMAIN}/success.html?api_key=${newAPIKey}`,
        cancel_url: `${DOMAIN}/cancel.html`,
    })

    //create firebase record
    const data = {
        APIkey: newAPIKey,
        payment_type: product,
        stripeCustomerId,
        status: quantity_type // this can be subscription or quatity (e.g. 8)
    }
    
    const dbRes = await db.collection('api_keys').doc(newAPIKey).set(data, { merge: true })

    //use webhook to access the firebase entry for that api key and ensure that billing info is updated accordingly
    res.redirect(303, session.url)
})

app.post('/stripe_webhook', (req, res) => {

})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))



//const serverless = require("serverless-http")
//const router = express.Router();
//app.use("/.biz-api/functions/app", router);
//module.exports.handler = serverless(app);