///////////// Initial Setup /////////////
var prompt = require('prompt');
const dotenv = require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const axios = require('axios');
const request = require('request-promise');

const shopifyApiPublicKey = process.env.SHOPIFY_API_PUBLIC_KEY;
const shopifyApiSecretKey = process.env.SHOPIFY_API_SECRET_KEY;
const scopes = 'write_products';
const appUrl = 'https://7dc6b290.ngrok.io';

const app = express();
const PORT = 3000

app.get('/', (req, res) => {
  res.send('Hello World')
});

///////////// Helper Functions /////////////

const buildRedirectUri = () => `${appUrl}/shopify/callback`;

const buildInstallUrl = (shop, state, redirectUri) => `https://${shop}/admin/oauth/authorize?client_id=${shopifyApiPublicKey}&scope=${scopes}&state=${state}&redirect_uri=${redirectUri}`;

const buildAccessTokenRequestUrl = (shop) => `https://${shop}/admin/oauth/access_token`;

const buildShopDataRequestUrl = (shop) => `https://${shop}/admin/shop.json`;

const generateEncryptedHash = (params) => crypto.createHmac('sha256', shopifyApiSecretKey).update(params).digest('hex');

const fetchAccessToken = async (shop, data) => await axios(buildAccessTokenRequestUrl(shop), {
  method: 'POST',
  data
});

const fetchShopData = async (shop, accessToken) => await axios(buildShopDataRequestUrl(shop), {
  method: 'GET',
  headers: {
    'X-Shopify-Access-Token': accessToken
  }
});

///////////// Route Handlers /////////////

app.get('/shopify', (req, res) => {
  const shop = req.query.shop;

  if (!shop) { return res.status(400).send('no shop')}

  const state = nonce();

  const installShopUrl = buildInstallUrl(shop, state, buildRedirectUri())

  res.cookie('state', state) // should be encrypted in production
  res.redirect(installShopUrl);
});
/*
app.get('/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  const stateCookie = cookie.parse(req.headers.cookie).state;

  if (state !== stateCookie) { return res.status(403).send('Cannot be verified')}

  const { hmac, ...params } = req.query
  const queryParams = querystring.stringify(params)
  const hash = generateEncryptedHash(queryParams)

  if (hash !== hmac) { return res.status(400).send('HMAC validation failed')}

  try {
    const data = {
      client_id: shopifyApiPublicKey,
      client_secret: shopifyApiSecretKey,
      code
    };
    const tokenResponse = await fetchAccessToken(shop, data)

    const { access_token } = tokenResponse.data

    const shopData = await fetchShopData(shop, access_token)
    res.send(shopData.data.shop)

  } catch(err) {
    console.log(err)
    res.status(500).send('something went wrong')
  }
    
});
*/

app.get('/shopify/callback', (req,res) => {
    const {shop,hmac,code,state} = req.query;
    const stateCookie = cookie.parse(req.headers.cookie).state;
    
    if(state !== stateCookie){
        return res.status(403).send('Request origin cannot be verified');
    }
    if(shop && hmac && code){
        const map = Object.assign({},req.query);
        delete map['hmac'];
        const message = querystring.stringify(map);
        const generatedHash = crypto.createHmac('sha256',shopifyApiSecretKey)
        .update(message).digest('hex');
        
        if(generatedHash !== hmac){
            return res.status(400).send('HMAC validation failed');
        }
        const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
        const accessTokenPayLoad = {
            client_id:shopifyApiPublicKey,
            client_secret:shopifyApiSecretKey,
            code
        };
        
        request.post(accessTokenRequestUrl,{json: accessTokenPayLoad})
        .then((accessTokenResponse) => {
            const accessToken = accessTokenResponse.access_token;
            
            const apiRequestUrl = 'https://' + shop + '/admin/products.json';// GET URL
            const apiRequestHeader = {
                'X-Shopify-Access-Token': accessToken
            };
            request.get(apiRequestUrl,{headers: apiRequestHeader})
            .then((apiResponse) =>{
                res.end(apiResponse);
            })
            .catch((error) => {
                res.status(error.statusCode).send(error.error.error_description);
            });
        })
        .catch((error) =>{
            res.status(error.statusCode).send(error.error.error_description);
        });
    }else{
        res.status(400).send('Required Parameters missing');
    }
});

//functions to send mail
var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

//email user
function getReceiver(receiver,eta_product){

var mailOptions = {
  from: 'youremail@gmail.com',
  to: receiver,
  subject: 'Vessel Pre Order',
  text: eta_product
};

transporter.sendMail(mailOptions, function(error, info){
  if (error) {
    console.log(error);
  } else {
    console.log('Email sent: ' + info.response);
  }
});
}


///////////// Start the Server /////////////

app.listen(PORT, () => console.log(`listening on port ${PORT}`));