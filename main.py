from flask import Flask,session,redirect,url_for,render_template,request
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import random
import smtplib
from email.mime.text import MIMEText
sender_email = "agrofavor47@gmail.com"
scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
credentials = {
  # it google client key..!
}
credentials = ServiceAccountCredentials.from_json_keyfile_dict(credentials, scope)
client = gspread.authorize(credentials)
usersheet = client.open('users').sheet1
directsheet = client.open('direct').sheet1
app = Flask(__name__)
app.secret_key = "9cbbb0c2a9554e1599018440d14f45ff"
data = {"tomato":"https://img.etimg.com/thumb/width-640,height-480,imgsize-56196,resizemode-75,msid-95423731/magazines/panache/5-reasons-why-tomatoes-should-be-your-favourite-fruit-this-year/tomatoes-canva.jpg","rice":"https://www.healthdigest.com/img/gallery/what-happens-to-your-body-when-you-eat-rice-every-day/l-intro-1621358205.jpg","banana":"https://static.wixstatic.com/media/53e8bb_a1e88e551162485eb4ff962437300872~mv2.jpeg/v1/crop/x_0,y_105,w_1024,h_919/fill/w_560,h_560,al_c,q_80,usm_0.66_1.00_0.01,enc_auto/Banana.jpeg"}
@app.route('/')
def well():
    return render_template("well.html")
@app.route('/home')
def index():
    if "username" not in session:
        return render_template("login.html")
    return render_template("index.html",user=session['username'].title())
@app.route('/login',methods=['post'])
def login():
    try:
        user = request.form['username']
        pwd = request.form['password']
        if user in usersheet.col_values(2):
            cell = usersheet.row_values(usersheet.col_values(2).index(user)+1)
            if pwd == cell[10]:
                session['username'] = user
                return redirect(url_for("index"))
            else :
                return render_template("login.html",msg="User or Password incorrect!")
        else:
            return render_template("login.html",msg="User or Password incorrect!")
    except Exception as e:
        return render_template("error.html",msg=e)
@app.route('/signup')
def signup():
    return render_template("signup.html")
@app.route('/signup1',methods=["post"])
def signup1():
    fname,dname,age,gender,state,district,address,pincode,gmail,pnumber,password = request.form.get('fullname'),request.form.get('dname').lower(),request.form.get('age'),request.form.get('gender'),request.form.get('state'),request.form.get('district',"none"),request.form.get('address'),request.form.get('pincode'),request.form.get('gmail'),request.form.get("pnumber"),request.form.get('password')
    if gmail in usersheet.col_values(9):
        return render_template("login.html",msg="Already account on Gmail")
    if pnumber in usersheet.col_values(10):
        return render_template("login.html",msg="Already account on Mobile number")
    if dname in usersheet.col_values(2):
        session['stopped'] = [fname,dname,age,gender,state,district,address,pincode,gmail,pnumber,password]
        return render_template("extra.html",txt="<h1 style='color: red;'>Display name taken</h1><form action='/signup2' method='post'><input type='text' style='padding: 10px;border: none;width: 300px;margin: 5px 0px 0px 10px;border-radius: 50px;' name='dname' placeholder='Enter again display name'><input type='submit' style='background-color: #008cff;color: aliceblue;border-radius: 20px;padding: 10px;border: none;cursor: pointer;margin-right: 10px;' value='submit'></form>")
    usersheet.append_row([fname,dname,age,gender,state,district,address,pincode,gmail,pnumber,password])
    session['username'] = dname
    return redirect(url_for("index"))
@app.route('/signup2',methods=['post'])
def signup2():
    dname = request.form.get('dname')
    if dname in usersheet.col_values(2):
        return render_template("extra.html",txt="<h1 style='color: red;'>Display name taken</h1><form action='/signup2' method='post'><input type='text' style='padding: 10px;border: none;width: 300px;margin: 5px 0px 0px 10px;border-radius: 50px;' name='dname' placeholder='Enter again display name'><input type='submit' style='background-color: #008cff;color: aliceblue;border-radius: 20px;padding: 10px;border: none;cursor: pointer;margin-right: 10px;' value='submit'></form>")
    fname,_,age,gender,state,district,address,pincode,gmail,pnumber,password = session['stopped']
    usersheet.append_row([fname,dname,age,gender,state,district,address,pincode,gmail,pnumber,password])
    session['username'] = dname
    return redirect(url_for("index"))
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for("well"))
@app.route("/home/shopping")
def shop():
    if "username" not in session:
        return render_template("login.html")
    return render_template("shopping.html")
@app.route("/home/direct_selling/rice")
def item1():
    if "username" not in session:
        return render_template("login.html")
    return direct_selling("rice")
@app.route("/home/direct_selling/tomato")
def item2():
    if "username" not in session:
        return render_template("login.html")
    return direct_selling("tomato")
@app.route("/home/direct_selling/banana")
def item3():
    if "username" not in session:
        return render_template("login.html")
    return direct_selling("banana")
def direct_selling(product):
    try:
        items,price,kg,address,number,code = directsheet.col_values(1),directsheet.col_values(2),directsheet.col_values(3),directsheet.col_values(4),directsheet.col_values(5),""
        for i,item in enumerate(items):
            if item == product:
                code += f"""<section onclick="window.location.href = '/home/direct_selling/{product}'">
            <h2>{product.upper()}</h2>
            <p>Price: ₹{price[i]} per kg</p>
            <p>Quantity: {kg[i]} kg</p>
            <p>location : {address[i]}</p>
            <a href="tel:{number[i]}"><button>Call to farmer</button></a>
        </section>"""
        return render_template("direct.html",products=code)
    except Exception as e:
        return e
@app.route("/home/direct_selling")
def direct():
    if "username" not in session:
        return render_template("login.html")
    try:
        session["ap"] = {}
        for i in data.keys():
            session["ap"][i] = {"price":[],"kg":0}
        for product in range(2,len(directsheet.col_values(1))+1):
            pro = directsheet.row_values(product)
            session["ap"][pro[0]]["price"].append(pro[1])
            session["ap"][pro[0]]["kg"] += int(pro[2])
        pro,apro = "",[]
        for product in session["ap"].keys():
            if session["ap"][product]["kg"] == 0:
                continue
            apro.append(product)
            if min(session["ap"][product]["price"])==max(session["ap"][product]["price"]):
                session["ap"][product]["aprice"] = max(session["ap"][product]["price"])
            else:
                session["ap"][product]["aprice"] = f"{min(session['ap'][product]['price'])} - {max(session['ap'][product]['price'])}"
        for product in apro:
            pro += f"""<section onclick="window.location.href = '/home/direct_selling/{product}'">
            <h2>{product.upper()}</h2>
            <img src="{data[product]}" alt="{product}">
            <p>Price: ₹{session["ap"][product]["kg"]} per kg</p>
            <p>Quantity: {session["ap"][product]["aprice"]} kg</p>
        </section>"""
        if pro =="":
            pro = "<h1>No products available</h1>"
        return render_template("direct.html",products=pro)
    except Exception as e:
        return render_template("error.html",msg=e)
@app.route("/home/fertilizer")
def fertilizer():
    user = session['username']
    return render_template("fertilizer.html",user=user)

















@app.route("/home/direct_selling1")
def direct1():
    otp = str(random.randint(100000, 999999))
    try:
        recipient_email = "svenkatavarun143@gmail.com"
        subject = "Agro Favor"
        body = f"""
        <html>
        <body>
            <p>This is OTP <b>{otp}</b> email sent from agro favor.</p>
        </body>
        </html>
        """
        html_message = MIMEText(body, 'html')
        html_message['Subject'] = subject
        html_message['From'] = sender_email
        html_message['To'] = recipient_email
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(sender_email, "PASSWORD")
            server.sendmail(sender_email, recipient_email, html_message.as_string())
    except Exception as e:
      return e
    return "send"
