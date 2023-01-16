/* eslint-disable no-undef */
const express = require("express");
const app = express();
const path = require("path");
const { Admin, Election, question, Option, Voter } = require("./models");
const bcrypt = require("bcrypt");
var cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const localStrategy = require("passport-local");
const passport = require("passport");
const flash = require("connect-flash");
const voter = require("./models/voter");

const saltRounds = 10;

app.use(flash());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser("ssh! some secret string!"));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "my-super-secret-key-2178172615261562",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(function (request, response, next) {
  response.locals.messages = request.flash();
  next();
});

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new localStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      Admin.findOne({ where: { email: username } })
        .then(async (user) => {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid password" });
          }
        })
        .catch((error) => {
          console.log(error);
          return done(null, false, {
            message: "This email is not registered",
          });
        });
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  Admin.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

// home page
app.get("/", (request, response) => {
  response.render("home");
});

// signup page frontend
app.get("/signup", (request, response) => {
  response.render("signup");
});

// login page frontend
app.get("/login", (request, response) => {
  response.render("login");
});

// admin home page frontend
app.get(
  "/home",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInAdminID = request.user.id;
    const admin = await Admin.findByPk(loggedInAdminID);

    const elections = await Election.findAll({
      where: { adminID: request.user.id },
    });

    response.render("adminHome", {
      username: admin.name,
      elections: elections,
    });
  }
);

app.get(
  "/election",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInAdminID = request.user.id;
    const elections = await Election.findAll({
      where: { adminID: loggedInAdminID },
    });

    return response.json({ elections });
  }
);

// election home page
app.get(
  "/election/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInAdminID = request.user.id;
    const admin = await Admin.findByPk(loggedInAdminID);
    const elections = await Election.findByPk(request.params.id);

    const questions = await question.findAll({
      where: { electionID: request.params.id },
    });

    const voters = await Voter.findAll({
      where: { electionID: request.params.id },
    });

    response.render("electionHome", {
      election: elections,
      username: admin.name,
      questions: questions,
      voters: voters,
    });
  }
);

// delete election
app.delete(
  "/election/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    // get all questions of that election
    const questions = await question.findAll({
      where: { electionID: request.params.id },
    });

    // delete all options and then questions of that election
    questions.forEach(async (Question) => {
      const options = await Option.findAll({
        where: { questionID: Question.id },
      });
      options.forEach(async (option) => {
        await Option.destroy({ where: { id: option.id } });
      });
      await question.destroy({ where: { id: Question.id } });
    });

    // delete voters of the election
    const voters = await Voter.findAll({
      where: { electionID: request.params.id },
    });
    voters.forEach(async (voter) => {
      await Voter.destroy({ where: { id: voter.id } });
    });

    try {
      await Election.destroy({ where: { id: request.params.id } });
      return response.json({ ok: true });
    } catch (error) {
      console.log(error);
      response.send(error);
    }
  }
);

// create new election
app.post(
  "/election",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (!request.body.name) {
      return response.flash("error", "Election name can't be empty");
    }

    const loggedInAdminID = request.user.id;
    try {
      await Election.add(loggedInAdminID, request.body.name);
      response.redirect("/home");
    } catch (error) {
      console.log(error);
      response.send(error);
    }
  }
);

// create new election frontend
app.get(
  "/elections/new",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInAdminID = request.user.id;
    const admin = await Admin.findByPk(loggedInAdminID);

    response.render("newElection", { username: admin.name });
  }
);

// edit election frontend
app.get(
  "/election/:id/edit",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInAdminID = request.user.id;
    const election = await Election.findByPk(request.params.id);
    const admin = await Admin.findByPk(loggedInAdminID);

    response.render("editElection", {
      election: election,
      username: admin.name,
    });
  }
);

app.post(
  "/election/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("found");
    try {
      await Election.update(
        { name: request.body.name },
        { where: { id: request.params.id } }
      );
      response.redirect("/home");
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// create new admin user
app.post("/users", async (request, response) => {
  // validation checks
  if (request.body.email.length === 0) {
    request.flash("error", "Email can't be empty");
    return response.redirect("/signup");
  }

  if (request.body.password.length === 0) {
    request.flash("error", "Password can't be empty");
    return response.redirect("/signup");
  }

  if (request.body.name.length === 0) {
    request.flash("error", "Name can't be empty");
    return response.redirect("/signup");
  }

  if (request.body.password.length < 8) {
    request.flash("error", "Password must be atleast 8 characters long");
    return response.redirect("/signup");
  }

  // check if email already exists
  const admin = await Admin.findOne({ where: { email: request.body.email } });
  if (admin) {
    request.flash("error", "Email already exists");
    return response.redirect("/signup");
  }

  // hasing the password
  const hashpwd = await bcrypt.hash(request.body.password, saltRounds); // take time so add await
  try {
    const user = await Admin.create({
      name: request.body.name,
      email: request.body.email,
      password: hashpwd,
    });
    request.login(user, (err) => {
      if (err) {
        console.log(err);
        response.redirect("/");
      } else {
        request.flash("success", "Sign up successful");
        response.redirect("/home");
      }
    });
  } catch (error) {
    request.flash("error", error.message);
    return response.redirect("/signup");
  }
});

// add question to election
app.post(
  "/election/:id/questions/add",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInAdminID = request.user.id;

    const election = await Election.findByPk(request.params.id);

    if (election.adminID !== loggedInAdminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.launched) {
      console.log("Election already launched");
      return response.json({ error: "Request denied" });
    }

    try {
      await question.add(
        request.body.title,
        request.body.description,
        request.params.id
      );
      response.redirect(`/election/${request.params.id}`);
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// delete option for question
app.delete(
  "/election/:electionID/question/:questionID/option/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    const Question = await question.findByPk(request.params.questionID);

    if (!Question) {
      console.log("Question not found");
      return response.json({ error: "Question not found" });
    }

    try {
      await Option.destroy({ where: { id: request.params.id } });
      return response.json({ ok: true });
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// delete question
app.delete(
  "/election/:id/question/:questiondID",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.id);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    try {
      // deleting all options of that question
      await Option.destroy({
        where: { questionID: request.params.questiondID },
      });
      // delete question
      await question.destroy({ where: { id: request.params.questiondID } });
      return response.json({ ok: true });
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// questions home page with all options
app.get(
  "/election/:id/question/:questiondID",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const admin = await Admin.findByPk(adminID);
    const election = await Election.findByPk(request.params.id);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    const Question = await question.findByPk(request.params.questiondID);

    const options = await Option.findAll({
      where: { questionID: request.params.questiondID },
    });

    response.render("questionHome", {
      username: admin.name,
      question: Question,
      election: election,
      options: options,
    });
  }
);

// add option to questions
app.post(
  "/election/:electionID/question/:questionID/options/add",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;

    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.launched) {
      console.log("Election already launched");
      return response.json({ error: "Request denied" });
    }

    try {
      await Option.add(request.body.option, request.params.questionID);
      response.redirect(
        `/election/${request.params.electionID}/question/${request.params.questionID}`
      );
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// launch election
app.put(
  "/election/:id/launch",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("launch initiaited");
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.id);

    // ensure that admin has access rights
    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    // ensure that there is atelast 1 question in the election
    const questions = await question.findAll({
      where: { electionID: request.params.id },
    });
    if (questions.length === 0) {
      console.log("No questions added");
      return response.json({ error: "No questions added" });
    }

    // ensure that each question has alteast 2 options
    for (let i = 0; i < questions.length; i++) {
      const options = await Option.findAll({
        where: { questionID: questions[i].id },
      });
      if (options.length < 1) {
        console.log("No options added");
        return response.json({ error: "No options added" });
      }
    }

    try {
      console.log("test passed");
      await Election.launch(request.params.id);
      console.log("launch success");
      return response.json({ ok: true });
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// end election
app.put(
  "/election/:id/end",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.id);

    // ensure that admin has access rights
    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.ended === true || election.launched === false) {
      console.log("Election not launched");
      return response.json({ error: "Election not launched" });
    }

    try {
      await Election.end(request.params.id);
      return response.json({ ok: true });
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// election preview
app.get(
  "/election/:id/preview",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.id);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    const questions = await question.findAll({
      where: { electionID: request.params.id },
    });

    const options = [];

    for (let i = 0; i < questions.length; i++) {
      const allOption = await Option.findAll({
        where: { questionID: questions[i].id },
      });
      options.push(allOption);
    }

    response.render("preview", {
      election: election,
      questions: questions,
      options: options,
    });
  }
);

// edit question
app.post(
  "/election/:electionID/question/:questionID/update",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("found");
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.launched) {
      console.log("Election already launched");
      return response.json({ error: "Request denied" });
    }

    try {
      await question.edit(
        request.body.title,
        request.body.description,
        request.params.questionID
      );
      response.redirect(
        `/election/${request.params.electionID}/question/${request.params.questionID}`
      );
    } catch (error) {
      console.log(error);
      return;
    }
  }
);

// edit question frontend
app.get(
  "/election/:electionID/question/:questionID/edit",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const admin = await Admin.findByPk(adminID);
    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.launched) {
      console.log("Election already launched");
      return response.json({ error: "Request denied" });
    }

    const Question = await question.findByPk(request.params.questionID);
    response.render("editQuestion", {
      username: admin.name,
      election: election,
      question: Question,
    });
  }
);

// add voter
app.post(
  "/election/:id/voters/add",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.id);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    const existingVoter = await Voter.findOne({
      where: { electionID: request.params.id, voterID: request.body.voterID },
    });

    if (existingVoter) {
      console.log("Voter already exists");
      return response.json({ error: "Voter already exists" });
    }

    try {
      await Voter.add(
        request.body.voterID,
        request.body.password,
        request.params.id
      );
      response.redirect(`/election/${request.params.id}`);
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// delete voter
app.post(
  "/election/:electionID/voter/:voterID/delete",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    try {
      await Voter.delete(request.params.voterID);
      return response.json({ ok: true });
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// edit option frontend
app.get(
  "/election/:electionID/question/:questionID/option/:optionID/edit",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const admin = await Admin.findByPk(adminID);
    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.launched) {
      console.log("Election already launched");
      return response.json({ error: "Request denied" });
    }

    const Question = await question.findByPk(request.params.questionID);
    const option = await Option.findByPk(request.params.optionID);
    response.render("editOption", {
      username: admin.name,
      election: election,
      question: Question,
      option: option,
    });
  }
);

// edit option
app.post(
  "/election/:electionID/question/:questionID/option/:optionID/update",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const election = await Election.findByPk(request.params.electionID);

    if (election.adminID !== adminID) {
      console.log("You don't have access to edit this election");
      return response.json({ error: "Request denied" });
    }

    if (election.launched) {
      console.log("Election already launched");
      return response.json({ error: "Request denied" });
    }

    try {
      await Option.edit(request.body.value, request.params.optionID);
      // return response.json({ ok: true });
      response.redirect(
        `/election/${request.params.electionID}/question/${request.params.questionID}`
      );
    } catch (error) {
      console.log(error);
      return;
    }
  }
);

// cast vote frontend
app.get("/election/:id/vote", async (request, response) => {
  const election = await Election.findByPk(request.params.id);
  const questions = await question.findAll({
    where: {
      electionID: request.params.id,
    },
  });
  const options = [];

  for (let i = 0; i < questions.length; i++) {
    const allOption = await Option.findAll({
      where: { questionID: questions[i].id },
    });
    options.push(allOption);
  }

  if (election.launched === false) {
    console.log("Election not launched");
  }

  if (election.ended === true) {
    console.log("Election ended");
  }

  if (voter.voted) {
    response.render("vote", {
      election: election,
      questions: questions,
      options: options,
      verified: true,
      submitted: true,
    });
  } else {
    response.render("vote", {
      election: election,
      questions: questions,
      options: options,
      verified: false,
      submitted: false,
    });
  }
});

// login voter
app.post("/election/:id/vote", async (request, response) => {
  const election = await Election.findByPk(request.params.id);

  if (election.launched === false) {
    console.log("Election not launched");
    return response.send("Election not launched");
  }

  if (election.ended === true) {
    console.log("Election ended");
    return response.send("Election ended");
  }

  try {
    const voter = await Voter.findOne({
      where: {
        electionID: request.params.id,
        voterID: request.body.voterID,
        password: request.body.password,
      },
    });

    if (voter) {
      // render election
      const questions = await question.findAll({
        where: {
          electionID: request.params.id,
        },
      });
      const options = [];

      for (let i = 0; i < questions.length; i++) {
        const allOption = await Option.findAll({
          where: { questionID: questions[i].id },
        });
        options.push(allOption);
      }

      if (voter.voted) {
        response.render("vote", {
          election: election,
          questions: questions,
          options: options,
          verified: true,
          voter: voter,
          submitted: true,
        });
      } else {
        response.render("vote", {
          election: election,
          questions: questions,
          options: options,
          verified: true,
          voter: voter,
          submitted: false,
        });
      }
    } else {
      // flash invalid
      response.render("vote", {
        election: election,
        questions: [],
        options: [],
        verified: false,
        voter: null,
        submitted: false,
      });
    }
  } catch (error) {
    console.log(error);
    return response.send(error);
  }
});

// submit voter response
app.post(
  "/election/:electionID/voter/:id/submit",
  async (request, response) => {
    const election = await Election.findByPk(request.params.electionID);

    // validation checks
    if (election.launched === false) {
      console.log("Election not launched");
      return response.send("Election not launched");
    }

    if (election.ended === true) {
      console.log("Election ended");
      return response.send("Election ended");
    }

    try {
      const voter = await Voter.findByPk(request.params.id);

      const questions = await question.findAll({
        where: {
          electionID: request.params.electionID,
        },
      });

      let responses = [];

      for (let i = 0; i < questions.length; i++) {
        const responseID = Number(request.body[`question-${questions[i].id}`]);
        responses.push(responseID);
      }

      // add responses of voter
      await Voter.addResponse(request.params.id, responses);

      // mark the voter as voted
      await Voter.markVoted(request.params.id);

      // render thank you message
      response.render("vote", {
        election: election,
        questions: [],
        options: [],
        verified: true,
        voter: voter,
        submitted: true,
      });
    } catch (error) {
      console.log(error);
      return response.send(error);
    }
  }
);

// election results frontend
app.get(
  "/election/:id/result",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const adminID = request.user.id;
    const admin = await Admin.findByPk(adminID);
    const election = await Election.findByPk(request.params.id);

    if (adminID !== election.adminID) {
      return response.send("You are not authorized to view this page");
    }

    const questions = await question.findAll({
      where: {
        electionID: request.params.id,
      },
    });

    const voters = await Voter.findAll({
      where: {
        electionID: request.params.id,
      },
    });

    let votesCast = 0;
    voters.forEach((voter) => {
      if (voter.voted) {
        votesCast++;
      }
    });

    const totalVoters = voters.length;

    let optionPercentage = [];

    for (let i = 0; i < questions.length; i++) {
      // specific question
      let array = [];

      // all options of that question
      const allOption = await Option.findAll({
        where: { questionID: questions[i].id },
      });

      allOption.forEach((option) => {
        // count for specific option
        let count = 0;

        voters.forEach((voter) => {
          if (voter.responses.includes(option.id)) {
            count++;
          }
        });

        const percent = (count * 100) / totalVoters;

        // adding the percentage for that specific option of specific question
        array.push(percent.toFixed(2));
      });

      optionPercentage.push(array);
    }

    const options = [];

    for (let i = 0; i < questions.length; i++) {
      const allOption = await Option.findAll({
        where: { questionID: questions[i].id },
      });
      options.push(allOption);
    }

    console.log(questions);

    response.render("result", {
      username: admin.name,
      election: election,
      questions: questions,
      options: options,
      data: optionPercentage,
      votesCast: votesCast,
      totalVoters: totalVoters,
    });
  }
);

// signout admin
app.get("/signout", (request, response) => {
  request.logout((err) => {
    if (err) {
      return next(err);
    } else {
      response.redirect("/");
    }
  });
});

app.post(
  "/session",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  function (request, response) {
    response.redirect("/home");
  }
);

module.exports = app;
