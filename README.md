SOMA Shade Control
======================

This project was created to control the SOMA smart shades using BLE.
Additionally, a basic HTTP interface allows control over the internet.

# Local Control

SOMA shades can be controlled using a BLE interface.

It refers heavily to [SOMA-Smart-Shades-HTTP-API](https://github.com/paolotremadio/SOMA-Smart-Shades-HTTP-API),
but is written as a node library using noble instead of invoking
the GATT Tool directly.

## Installation

```
cd soma-shade-control
npm install
```
## Usage

Local control provides the following actions:

* Get battery level
```
soma.js battery -m <MAC Address>
```
* Get current shade position in percent
```
soma.js position -m <MAC Address>
```
* Set a target for the shade position in percent
```
soma.js target 50 -m <MAC Address>
```
* Move the shade up
```
soma.js up -m <MAC Address>
```
* Move the shade down
```
soma.js down -m <MAC Address>
```
* Stop the shade moving
```
soma.js stop -m <MAC Address>
```

# HTTP Control

## Installation

First install the dependencies required for local control.
To install as a system service:

```
sudo cp systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable soma-http
sudo systemctl start soma-http
```

## Usage

To run normally, just run the script:
```
sudo ./soma-http.js
```

### Interface

The HTTP application has a JSON interface and supports all of the local
control commands. Below are some examples using `curl`.

JSON takes the format:
```
{
  "shade": <shade mac address>,
  "action": <battery/position/target>,
  "value": <target value>
}
```

* Get battery level
```
curl --header "Content-Type: application/json" --request GET -d '{"shade": <shade address>, "action": "battery" }' -u admin:password <Server Address>/shades
```
* Get current shade position in percent
```
curl --header "Content-Type: application/json" --request GET -d '{"shade": <shade address>, "action": "position" }' -u admin:password <Server Address>/shades
```
* Set a target for the shade position in percent
```
curl --header "Content-Type: application/json" --request POST -d '{"shade": <shade address>, "action": "target", "value": 50 }' -u admin:password <Server Address>/shades
```
* Move the shade up
```
curl --header "Content-Type: application/json" --request POST -d '{"shade": <shade address>, "action": "up"}' -u admin:password <Server Address>/shades
```
* Move the shade down
```
curl --header "Content-Type: application/json" --request POST -d '{"shade": <shade address>, "action": "down"}' -u admin:password <Server Address>/shades
```
* Stop the shade moving
```
curl --header "Content-Type: application/json" --request POST -d '{"shade": <shade address>, "action": "stop"}' -u admin:password <Server Address>/shades
```
