"""Prepare 300 exclusive recipe/hook pairs and 30 native-image chat jobs."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bridge import atomic

# Every line specifies a different physical event, rather than recoloring a gag.
# Photograph the instant immediately BEFORE the event; animation starts at zero.
HOOKS = {
'COPY18': '''A woman holds a birthday cake near her husband; she turns it to reveal a comically huge unlit candle and bursts into surprised laughter.
A wife peeks through opera glasses at her husband across a dining table, then lowers them with a delighted raised eyebrow.
A woman opens a tiny gift box and a long accordion of paper hearts unfolds across the table.
A husband enters carrying a grocery bag; his wife produces a homemade cardboard medal and hangs it over his fully clothed chest.
A woman takes a sip of sparkling water then almost laughs it out, covering her mouth while looking at her grinning husband.
A wife uses a kitchen magnifying glass to inspect his little honey spoon, then points between the spoon and her husband in amazement.
A woman at a sewing table drops her knitting needles onto a cushion and gives her husband a delighted double thumbs-up.
A wife lifts the lid of a breakfast tray to find a single enormous heart-shaped pancake and gasps with a smile.
A woman at a pottery table hears her husband approach, accidentally presses her soft clay bowl into a heart and laughs.
A wife pulls down a roll-up window shade to reveal her husband outside carrying a ridiculous bouquet of sunflowers.
A woman conducting a small backyard family gathering taps a glass and everyone directs a brief silent toast toward her embarrassed husband.
A wife turns a rotating tabletop picture frame from a straight face portrait to a giant smiling couple photograph.
A woman opens the refrigerator and finds her husband has arranged ordinary strawberries into a large heart on a tray.
A wife starts to take a selfie with her husband, notices his exaggerated proud pose and laughs while pulling him closer by the shoulder.
A woman uses a paper fan to cool her smiling face as her husband bows theatrically beside a breakfast table.
A wife pins a large gold ribbon to his apron, then gently spins him once to show it to camera.
A woman looking over the top of a crossword freezes her pencil, swivels toward her husband and gives an approving whistle-shaped smile.
A wife opens a cookbook to discover a funny handwritten heart doodle, holds it up and gives her husband an impressed look.
A woman ringing a small brass dinner bell turns it into an enthusiastic celebration when her husband arrives with breakfast.
A wife presses a toy applause button on a tabletop novelty speaker and gives her husband a playful standing ovation.
A woman hides behind a newspaper; she lowers it to reveal novelty heart-shaped sunglasses and a broad approving grin.
A wife pushes a little wheeled serving cart toward her husband with a large cardboard star displayed upright on it.
A woman cuts a ribbon across a kitchen doorway while her husband makes a mock grand entrance with a honey jar.
A wife removes a normal oven mitt to reveal a second comically large foam thumbs-up and waves it at her husband.
A woman opens a picnic basket and a bouquet of paper flowers springs up gently, making her clap once in delight.
A wife reaches for a coat on a hook and discovers her husband has tucked a long romantic handwritten note into the sleeve.
A woman watches her husband balance a breakfast tray; she catches a sliding napkin then looks amazed at his little triumphant bow.
A wife at a piano plays one celebratory flourish, then swivels on the stool to beam at her husband.
A woman flips a homemade scorecard from a blank back to ten hand-painted gold stars while looking at her husband.
A wife gently drops a party hat over his gray hair, then blows one paper party blower toward the camera.
A woman polishing a silver teapot discovers his smiling face in its reflection and turns toward him with a delighted laugh.
A wife tosses a small handful of rose petals upward above a breakfast table while her husband shields his honey spoon playfully.
A woman opens a fortune cookie and unrolls an absurdly long paper strip, looking approvingly at her husband.
A wife carries a little velvet cushion with a golden plastic trophy and presents it to her amused husband.
A woman at a garden bench lifts a large leaf away from her face to show a delighted astonished expression.
A wife hands her husband a microphone-shaped wooden spoon and gestures for him to take a mock victory speech.
A woman adjusts a telescope toward her husband only a few feet away, then peeks around it with exaggerated admiration.
A wife pulls a folding photo album open and a pop-up paper heart stands upright between them.
A woman setting dominoes down creates a quick heart-shaped chain reaction, then celebrates toward her husband.
A wife releases one heart-shaped helium balloon from under a tablecloth and points up with an impressed smile.
A woman opens a small jewelry case and finds a honey teaspoon instead of jewelry, looking from spoon to husband with amused disbelief.
A wife on a porch turns an ordinary welcome mat over to reveal a handmade crown drawing and invites her husband onto it.
A woman turns on a small disco lamp at the breakfast counter and gives her fully clothed husband a playful celebratory shoulder shimmy.''',
'COPY19': '''A mature man lifts a wilted celery stalk; it folds limply over his hand and he gives camera a disappointed eyebrow.
A man pushes a soft sponge pillar upright; it flops sideways onto the table and he shrugs.
A man tries to stand a cooked asparagus spear in mashed potatoes; it bends over immediately.
A man opens a limp paper umbrella over his coffee; the tiny canopy collapses and he looks annoyed.
A man displays a deflated football; squeezing it produces a deep dent and he shakes his head.
A man tries to snap a bent drinking straw straight; it droops back as he opens his palms.
A man extends a floppy fabric measuring tape and it curls down before reaching a nearby cup.
A man puts a soft foam sword on a stand; its tip sags and he rolls his eyes.
A man taps a sagging party balloon with one finger; it rolls sadly across a breakfast table.
A man tries to prop up a drooping tulip using a tiny wooden fork; the bloom bows anyway.
A man balances a rubber giraffe toy upright; its long neck folds onto a cushion.
A man flicks a loose badminton shuttle feather; it falls out and he holds the damaged shuttle in disbelief.
A man lifts a slice of soft pizza; the tip folds down and the topping slides back onto the plate.
A man picks up a limp paintbrush with droopy wet bristles and gestures at it in frustration.
A man raises a thin silicone spatula to the camera; its blade wobbles wildly from a gentle flick.
A man holds a soaked cardboard tube upright; it buckles halfway and he sighs silently.
A man pushes a toy inflatable cactus upright; it bends back down and he points at it with resignation.
A man opens an old beach chair and its loose fabric seat sags deeply under a small cushion.
A man stretches a tired elastic band between his hands; it stays slack and he shows it to camera.
A man lifts a floppy leather belt by the buckle and its length folds like a noodle.
A man sets an unfilled oven mitt standing upright; it slumps onto the kitchen board.
A man displays a bent feather duster; the fluffy head droops onto his shoulder and he looks sideways at it.
A man gently touches a collapsed paper lantern; its folds flatten and he gives a disappointed nod.
A man raises a limp leafy cabbage stem; the leaves hang down on both sides of his fist.
A man attempts to wave a tiny fabric pennant with a loose pole joint; the pole folds at the hinge.
A man pushes a plush toy dragon's neck upward; its head immediately flops back against its belly.
A man pulls a weak accordion bellows open; it collapses shut against his chest with a puzzled look.
A man hangs a limp crepe streamer between two cups; it droops onto the table halfway across.
A man tries to lift a soaked biscuit off a plate with a fork; it bends and breaks onto the plate.
A man holds a squishy stress banana toy upright; it bends sharply when he loosens his grip.
A man clicks open a damaged folding fan; only half opens and he gives an exasperated look.
A man places a floppy cloth crown on a mannequin head; the points fold down against its sides.
A man taps a sagging miniature hammock between two toy posts; it touches the tabletop.
A man pours a little sand into a paper cone; the cone creases and tips onto a tray.
A man lifts an overripe pear by its stem; it slides from the stem into a bowl safely.
A man tries to stand a floppy rubber chicken on a kitchen tray; its neck folds and he gestures at it.
A man takes a loose shoelace out of a shoe and holds it beside a firm shoehorn with a questioning expression.
A man gently lifts an empty cloth gardening glove; all its fingers droop over his wrist.
A man props up a soft crocheted carrot; its tip bends down onto a wooden board.
A man hangs a damp paper airplane from one finger; its wings droop and he lowers his chin.
A man holds a narrow strip of cooked lasagna vertically; it folds into a dish and he points at the empty hand.
A man lifts a soft felt fishing hat by the brim; its crown caves in and he makes a frustrated face.
A man tries to build a little tower from soft foam blocks; it bows and falls onto a padded mat.''',
'COPY21': '''A wife holds a transparent jar containing large blue diamond-shaped candy props; she shuts the lid firmly and slides it away from her husband.
A man reaches toward a blue diamond-shaped soap on the sink; his wife puts a closed wooden box over it and points him away.
A wife balances a blue glass diamond on a tiny toy heart-shaped scale; the scale tips and she looks concerned.
A man opens a wallet and a wife removes a blue diamond paper coupon, tears it once and drops it in an empty bin.
A wife places a blue diamond-shaped cardboard prop behind a tabletop stop-sign cutout and shakes her head at her husband.
A husband shows a calendar with one blue diamond sticker; his wife closes the calendar sharply and taps a honey jar beside it.
A wife puts a blue diamond plush toy in a tiny shopping cart and rolls it away from her husband.
A wife catches a rolling blue diamond-shaped plastic token in a tea strainer before it reaches her husband's open hand.
A wife lowers a glass cloche over a blue diamond jewel prop and crosses her arms in a worried look.
A husband tries to fish a blue diamond token out of a bowl with a spoon; his wife removes the entire bowl from reach.
A wife turns a blue diamond domino face down and replaces it with an ordinary wooden heart token.
A wife unplugs a novelty desk lamp with a blue diamond shade and points toward the breakfast table.
A wife puts a blue diamond paper bag on a scale; the toy heart on the other side visibly rises and she looks alarmed.
A wife folds a blue diamond napkin into a small closed envelope and slips it into a drawer.
A husband offers a blue diamond-shaped candy prop on a tray; his wife rotates the tray away and raises a stop palm.
A wife uses kitchen tongs to lift a large blue acrylic diamond into a locked-looking clear display box.
A wife closes a little toy elevator door containing a blue diamond token as her husband reaches toward it.
A wife rolls a blue diamond-shaped bath bomb away with a wooden rolling pin while her husband watches surprised.
A husband lifts a blue diamond kite from the table; his wife winds the string back quickly and shakes her head.
A wife lays a giant blue diamond playing card on the table, flips it face down and reveals an ordinary honey spoon beside it.
A wife puts a blue diamond sticker on a toy wind-up heart; the heart topples over and she immediately catches it.
A wife snips a ribbon holding a blue diamond ornament over a toy house, catching the ornament safely in a bowl.
A husband turns a blue diamond crank on a cardboard machine; his wife stops it with her palm and closes its flap.
A wife pulls a blue diamond bookmark out of a weekly planner, then firmly shuts the planner.
A husband rolls a blue diamond die; his wife covers it with an upside-down cup and gives him a stern look.
A wife removes a blue diamond ice cube from a tiny heart-shaped bowl using tongs and closes the ice bucket.
A husband reaches for a blue diamond keychain; his wife hooks it onto a rack and holds the rack out of reach.
A wife folds a pop-up card with a blue diamond inside; the paper heart beside it springs upright when the card closes.
A wife gently deflates a blue diamond party balloon and tucks it into a napkin while her husband looks on.
A husband points to a blue diamond on a miniature roulette wheel; his wife stops the wheel and slides it under a placemat.
A wife uses a little dustpan to sweep blue diamond confetti off the breakfast tray before her husband sits down.
A husband raises a blue diamond ice pack prop; his wife places it back in a zipped cooler and points to the kitchen.
A wife puts a blue diamond toy block behind a short cardboard fence, closing its little gate.
A husband balances a blue diamond trophy on a table; his wife removes the trophy and steadies the wobbling table.
A wife takes a blue diamond-shaped chocolate mold off a kitchen board and hangs it behind the cupboard door.
A husband opens a case of blue diamond cufflinks; his wife closes the lid and points to his ordinary shirt buttons.
A wife uses a small toy crane to lift a blue diamond token off a cardboard heart and park it on the far side.
A husband moves a blue diamond pawn on a board game; his wife places a wooden barrier in front of it and gives a stop gesture.
A wife wraps a blue diamond snow globe in a towel and puts it on a high shelf, visibly relieved.
A husband pulls a blue diamond-shaped cushion toward his chair; his wife replaces it with a regular heart-pattern cushion.
A wife catches a blue diamond spinning top under an inverted bowl and looks concerned at her husband.
A husband peels a blue diamond magnet off the refrigerator; his wife returns it to a small closed tin.
A wife gently lowers a blue diamond decoration on a string into a box beside a little paper heart and shuts the box.''',
'COPY22': '''A finger pokes a firmly standing gel cube; it wobbles then settles upright.
A man taps a small upright wooden peg; it remains solid while a nearby loose peg rolls away.
A man presses a fresh cucumber on a cutting board; it remains straight and he nods proudly.
A man drops a little wooden dowel upright into a holder; it clicks firmly into place and he gives a thumbs-up.
A man lightly flicks a short stiff paintbrush; its bristles spring back and he smiles.
A man pokes a small spring-mounted rooster toy; it bounces upright and settles.
A man nudges a self-righting wooden roly-poly toy; it immediately returns to standing.
A man snaps open a rigid folding ruler into a straight line and presents it confidently.
A man inflates a little tabletop bellows; a paper sailboat mast stands upright and stays there.
A man releases a compressed upright foam column; it springs back to full height and holds its shape.
A man lightly bends a short spring steel ruler; it returns straight without whipping near anyone.
A man places a firm carrot vertically into a small wooden socket and taps the top once.
A man presses a rubber doorstop firmly under a toy door and the door stops wobbling.
A man places a solid toy lighthouse on a rocking wooden board; it stays upright as he steadies the board.
A man tightens a wingnut on a miniature easel; the easel becomes rigid and he gives an approving smile.
A man gently pushes a small weighted punching-bag toy; it rebounds upright in one quick motion.
A man slides a support sleeve over a flexible toy flagpole; the pole now stands straight.
A man unfolds a stiff paper pop-up tower and taps its firm base twice.
A man taps a standing pretzel stick in a cheese cube; it keeps its shape and he raises an eyebrow happily.
A man clicks a wooden lock into a tiny bridge model; the sagging deck becomes a level deck.
A man braces a tiny deckchair with its locking bar and proudly presses down on the supported seat.
A man drops a rigid bookmark into a narrow slot; it stands upright next to a floppy ribbon bookmark.
A man presses a plunger on a harmless desktop toy; a tiny red flag pops upright and locks.
A man plants a bamboo skewer into a cork and gently tests the firm upright joint.
A man closes the latch on a miniature tripod; its little tabletop platform becomes steady.
A man places a thick stalk of broccoli upright into a bowl of dry rice and gently taps its crown.
A man snaps two building blocks into a tall rigid column and tests it with a finger.
A man presses a closed cardboard tube at its sides; it retains its straight cylindrical shape.
A man fits a narrow dowel into a toy spool; the spool stands straight while he releases it.
A man straightens a springy silicone whisk wire and watches it bounce back into shape.
A man pulls a small telescoping pointer out to full length; it locks straight with a confident nod.
A man presses a firm breadstick against a napkin roll and displays it upright afterward.
A man rotates a jointed wooden giraffe toy into its locking notch; its neck remains upright.
A man pushes a short cork stopper firmly into a bottle neck and gently tests the solid connection.
A man opens a sturdy little parasol and taps its locked center pole with a smile.
A man rolls a thick paper cylinder around a small core and stands it solidly on the desk.
A man presses a clamp onto a miniature leaning ladder; it now stands straight.
A man clips a small cloth pennant onto a stiff rod and raises the whole rod vertically.
A man stands a narrow toy rocket on a magnetic base; it clicks upright and stays there.
A man puts a stabilizing wooden foot on a small signpost and tests it gently.
A man flips a toggle on a mechanical toy; a short upright spring pole stiffens and stops wobbling.
A man places a firm zucchini into a broad jar of dry beans and proudly releases his grip.
A man seats a wooden chess king squarely into a small fitted display stand and taps it once.''',
'COPY23': '''A woman lifts a soup ladle dripping honey over a tiny teaspoon, realizes the size difference and quickly lowers the ladle away.
A woman pours a very small honey ribbon and abruptly pinches the squeeze bottle closed with an exaggerated stop face.
A woman unfolds an enormous serving spoon from a drawer and pushes it away from a tiny breakfast bowl.
A woman lowers a little honey drop toward a spoon and watches her husband slide an oversized empty bowl into view.
A woman puts a tiny teaspoon beside a huge wooden salad spoon, sweeps the huge spoon aside and points at the little one.
A woman begins opening an extra-large honey bucket; her husband offers a tiny spoon and she shuts the bucket with a laugh.
A woman pours honey onto a kitchen scale spoon; at the first drop she raises a stop palm and rights the bottle.
A woman catches a falling honey droplet with a tiny saucer and raises her eyebrows at how little is there.
A woman opens a bottle cap and her husband presents a comically huge funnel; she turns the funnel upside down as a clear refusal.
A woman holds a half-teaspoon honey scoop and stops her husband from bringing in an ice-cream scoop.
A woman tilts a giant honey jar toward a tiny espresso cup, then immediately places the jar upright before any pour.
A woman pinches a narrow honey sachet; one drop lands in a teaspoon and she folds the sachet closed.
A woman dips the very tip of a wooden honey dipper and immediately holds a palm up to the camera.
A woman takes a small honey-coated spoon out of a drawer while a toy stopwatch begins spinning beside her.
A woman carefully holds a tiny measuring spoon beneath a honey nozzle and closes the cap after a single thin strand.
A woman sees her husband bringing a gravy boat for honey and replaces it with a teaspoon from her apron pocket.
A woman slides a full honey pot back across the table and places just one tiny drop on a saucer.
A woman opens a long row of nesting measuring cups, skips all the large ones and presents the smallest with a knowing grin.
A woman lowers a long honey dipper toward a cup; her husband waves a small kitchen timer as she stops abruptly.
A woman pulls a honey-coated teaspoon out from under a glass cloche; the husband leans in amazed and she raises a stop finger.
A woman uses a toothpick to indicate a tiny honey portion, then points firmly away from a ladle beside it.
A woman sees a giant cocktail shaker beside the honey and removes it, replacing it with a tiny bowl.
A woman pours a honey thread onto parchment and folds the bottle cap closed as soon as a small dot forms.
A woman holds an empty syringe-shaped kitchen baster beside a teaspoon, rejects the baster and keeps the spoon.
A woman lowers a cookie cutter shaped like a huge spoon onto a table, then pushes it away from the actual little honey spoon.
A woman splits a honey sachet between two teaspoons, immediately folds it shut and looks surprised at the tiny portions.
A woman pulls a giant wooden stirrer out of a pot, looks at its size and returns it while picking up a little teaspoon.
A woman uses a clothespin to stop a thin paper honey sachet being squeezed further and shows a stop palm.
A woman discovers a huge bowl underneath a tiny bowl, hides the huge one and winks at her husband.
A woman catches her husband's oversize oven-gloved hand reaching toward honey and hands him a miniature spoon instead.
A woman turns an egg timer as her husband starts pouring honey, stopping the pour before its first full turn.
A woman pushes a giant dessert spoon backward along a serving rail and pulls the teaspoon forward.
A woman puts one tiny honey dab on the tip of a pastry brush, caps the jar and shows her husband the very small dab.
A woman folds a ruler away after comparing a huge spoon with a teaspoon and points to the teaspoon only.
A woman holds a very small honey-filled paper cup while her husband lifts a bucket; she drops a lid onto the bucket immediately.
A woman removes a large honey dipper from a tray and lays a short espresso spoon in the same place.
A woman tries to fit a large ladle under a small jar opening, pauses and switches to a tiny measuring spoon.
A woman stops a honey squeeze by placing a saucer over the bottle cap and gives a playful warning eyebrow.
A woman catches an oversized gold-colored plastic spoon with both hands and sets it far away from the breakfast place setting.
A woman picks up the smallest spoon from a magnet strip, deliberately leaving a row of much larger spoons behind.
A woman lifts a tiny honey portion on a spoon above a giant empty punch bowl and looks at the mismatch in amused shock.
A woman lets a thin honey thread reach a small spoon, then quickly winds the honey dipper away and closes the jar.
A woman places a toy traffic barrier in front of an enormous serving spoon and brings a teaspoon around the barrier.''',
'COPY24': '''A wife fans herself with a dinner menu while her energetic husband marches happily in place beside the breakfast table.
A wife drops into a cushioned porch chair and her husband cheerfully rolls a breakfast cart past her for another lap.
A wife displays a little white kitchen towel like a surrender flag while her husband playfully keeps dancing by the sofa.
A wife stops a spinning toy treadmill with one finger while her husband bounces his shoulders cheerfully beside it.
A wife holds up a kitchen timer with an exhausted grin as her husband enthusiastically adjusts his fully buttoned shirt.
A wife places a closed nap sign on her armchair and her husband taps a honey jar with an energetic smile.
A wife hides behind a sofa cushion while her husband performs one joyful little shuffle in the living room.
A wife lowers a hand fan to reveal amused exhaustion as her husband offers her a fresh cup of tea.
A wife sits on a garden bench catching her breath from a brisk walk while her husband merrily ties his walking shoes.
A wife removes her reading glasses and rubs her temples with a laugh while her husband keeps winding a tabletop toy drummer.
A wife turns a toy speed dial downward and her husband responds with an exaggerated patient grin.
A wife unrolls a long to-do list, sees her husband ready for another task and folds it shut with an exhausted chuckle.
A wife presses a toy pause button on a cardboard remote toward her husband as he keeps doing a cheerful step.
A wife offers her husband a large soft pillow and points toward his chair in a playful please-rest gesture.
A wife places a tiny roadblock in front of a fast rolling toy car and looks at her energetic husband in surrender.
A wife begins watering a plant; her husband arrives with a whole tray of new seedlings and she raises both hands in amused disbelief.
A wife leans on a kitchen rolling pin like a walking stick while her husband enthusiastically presents a breakfast tray.
A wife stacks her hands into a timeout gesture and her husband halts his playful little dance with a proud smile.
A wife points at a wall clock whose hands are a novelty fast-spinning prop while her husband happily pours tea.
A wife takes a seat at a picnic table and pushes her walking hat toward her still-energetic husband.
A wife opens a folding stool and sits immediately while her husband stretches his arms beside her fully clothed.
A wife holds a tiny paper finish line across the hallway and her husband steps through laughing.
A wife lays a big spoon across a little toy conveyor belt to stop it and gestures that enough is enough toward her husband.
A wife sets a second cup of tea onto a long serving tray and shakes her head with an amused tired grin at her husband.
A wife drapes a kitchen towel over her forehead while her husband winds a little musical-box crank enthusiastically.
A wife lowers a badminton racket onto a chair while her husband presents another shuttlecock with a hopeful smile.
A wife leans back in a porch swing and her husband brings her yet another brightly colored activity brochure.
A wife places a soft eye mask over her forehead and shows a stop palm at her husband's invitation to dance.
A wife tries to sit down with a book; her husband pulls out a little deck of dance cards and she laughs exhaustedly.
A wife catches a tiny wind-up rabbit under a bowl, then gives her energetic husband a playful knowing look.
A wife lowers a small accordion onto the table after one note while her husband enthusiastically taps both feet.
A wife points toward an empty coat rack as her husband brings a second walking jacket and she waves it away.
A wife puts a little hammock toy into a travel bag and points it toward her husband as an unmistakable request for rest.
A wife closes a picnic basket while her husband immediately presents another one and she gives a laughing stop gesture.
A wife slides a board-game hourglass onto its side to stop time while her husband waits with a cheerful grin.
A wife reclines on a fully clothed reading chair and places a paper crown on her husband's head in amused surrender.
A wife folds a large exercise mat away while her husband pops up holding two small hand weights.
A wife drapes a blanket over her knees while her husband appears at the doorway carrying a breakfast bell.
A wife holds a toy checkered flag backward as a stop signal while her husband rolls a honey jar forward on a small tray.
A wife sets an old-fashioned alarm clock face down as her husband gleefully points to a morning honey spoon.
A wife fans a stack of activity tickets, gives up and hands all of them to her enthusiastically smiling husband.
A wife pushes a toy carousel's stop lever while her husband beside her continues one playful shoulder dance.
A wife raises a folded paper umbrella over herself on a sunny porch as her exuberant husband offers another morning outing.''',
'COPY25': '''A fully robed man puts a honey jar on a dry bathroom shelf; his wife peeks around the door with an astonished smile.
A man reaches for a towel before his shower; a tiny honey spoon falls from a folded towel onto a dry tray and his wife raises her eyebrows.
A man puts a small honey spoon beside his closed bathrobe belt; his wife notices it in the bathroom mirror and smiles knowingly.
A fully dressed man enters a hallway carrying a honey teaspoon; two mature women looking at family photos pause and glance toward him.
A man holds a small honey jar near a bathroom sink; his wife moves her reading glasses down to inspect it with curiosity.
A man puts a honey spoon into a lidded breakfast cup before walking toward a closed shower curtain, and his wife points at the cup in surprise.
A robed man opens a bathroom cabinet containing a normal towel and a tiny honey jar; his wife peeks over his shoulder.
A man sets a honey jar next to his shaving brush; his wife swivels a little tabletop mirror to watch him with a knowing smile.
A man holds a teaspoon of honey at a bedroom dresser while his wife pauses fastening her necklace to look at him.
A man in an opaque bathrobe carefully pours honey into a spoon over a tray as his wife hangs a fresh towel near the door.
A man picks up a honey jar from a dry shower-stool shelf before entering the closed bathroom; his wife looks up from a magazine.
A man pulls a honey teaspoon out of a breakfast drawer and his wife follows it with an exaggerated sideways glance.
A man puts a honey jar on top of a stack of clean folded towels; his wife gently moves a towel aside to reveal the jar.
A fully clothed man fixes his hair in a hallway mirror after holding a honey spoon; his wife glances up and smiles in recognition.
A man hangs a fully closed robe on a bathroom hook and places a honey teaspoon on a dry counter while staying fully dressed.
A man carries a breakfast tray past a closed shower door; his wife reaches to tilt the tray slightly and spot the tiny honey jar.
A man lifts a honey pot off a bedside table while his wife peeks above the edge of her paperback in curiosity.
A man puts a honey sachet beside his toothbrush case; his wife notices and raises an amused eyebrow.
A robed man rolls a little cart with a honey spoon toward the bathroom door while his wife watches in amused surprise.
A man opens a small travel washbag and takes out a honey jar; his wife tilts her head in amused disbelief.
A man taps a honey spoon against a little breakfast saucer while his wife turns from arranging flowers to watch him.
A man sets a small honey jar inside a bathroom tray with rolled towels; his wife moves a rolled towel to see it better.
A fully dressed man checks his watch beside a breakfast honey spoon; his wife reaches around him to point at the honey.
A man puts a honey jar beside a decorative hourglass on a dry bathroom ledge; his wife flips the hourglass and smiles.
A robed man takes a honey teaspoon from a kitchen hatch while his wife looks through the hatch and raises her eyebrows.
A man turns a bathroom cabinet mirror toward his wife to show her the little honey jar on the shelf.
A man brings a small honey spoon onto a porch before his morning shower; his wife lowers her gardening hat brim to look at him.
A man places a honey jar behind a folded clean bath mat; his wife unfolds the mat and spots the jar with a surprised smile.
A man pulls a honey sachet from a shirt pocket while preparing a bathroom towel; his wife stops reading to glance at him.
A man sets a honey spoon beside a closed razor case; his wife points at the spoon and gives a curious knowing smile.
A robed man rests a honey jar on a little wooden bathroom ladder shelf; his wife gently peeks through its rungs.
A man carries a honey spoon past a bedroom doorway and his wife turns a swiveling vanity mirror to follow him.
A man takes a little honey jar from an opaque breakfast hamper; his wife lifts the hamper lid higher in amused curiosity.
A fully clothed man puts a bath towel over his shoulder and raises a honey teaspoon from a counter; his wife smiles from the doorway.
A man sets his honey jar on a kitchen window ledge before heading to the bathroom and his wife spots it from outside.
A man unrolls a breakfast napkin to reveal a small honey spoon; his wife briefly puts her hand over her surprised smile.
A man opens a bedside drawer and shows a tiny honey jar to his wife, who laughs and points toward the bathroom door.
A man carefully moves a honey jar away from a wet sink to a dry tray and his wife nods with an amused raised eyebrow.
A robed man rings a little breakfast bell beside his honey jar; his wife looks around the bathroom doorway in curiosity.
A man places a honey sachet next to a small closed perfume bottle and his wife reaches past the perfume to point at the sachet.
A man peeks into a breakfast basket before his shower, shows the honey jar and his wife gives him a playful impressed look.
A man folds a dry washcloth around a little honey jar on the counter; his wife gently lifts a corner and smiles at the discovery.'''
}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--brain', required=True)
    p.add_argument('--root', required=True)
    p.add_argument('--destination', required=True)
    p.add_argument('--audios', required=True)
    p.add_argument('--spec', help='JSON list of new audio_name, hook_idea and full recipe_prompt records.')
    p.add_argument('--home', default='https://flow.google.com/u/2/')
    p.add_argument('--id-start', type=int, default=1, help='First unique final ID when appending to a preserved delivery.')
    p.add_argument('--pairs-per-chat', type=int, default=10, help='Recipe/hook pairs in each explicitly requested image chat.')
    a = p.parse_args()
    if a.id_start < 1:
        raise ValueError('First pair ID must be positive.')
    if not 1 <= a.pairs_per_chat <= 50:
        raise ValueError('Pairs per chat must be between 1 and 50.')
    root = Path(a.root).resolve()
    if (root / 'manifest.json').exists():
        raise ValueError('Batch already planned; resume its manifest.')
    brain = Path(a.brain).resolve()
    base = (brain/'Skills/gerar_imagens_receita/references/prompt_base.txt').read_text(encoding='utf8')
    catalog = json.loads((brain/'Skills/gerar_imagens_receita/references/catalogo_cenarios.json').read_text(encoding='utf8'))
    recipe_preset = json.loads((Path(__file__).resolve().parents[1]/'presets/receita_movimento_inicial_teste_hooks.json').read_text(encoding='utf8'))
    root.mkdir(parents=True, exist_ok=True)
    atomic(root/'presets/recipe.json', recipe_preset)
    cases = [(audio, line.strip()) for audio, text in HOOKS.items() for line in text.splitlines() if line.strip()]
    assert len(cases) == 300, len(cases)
    assert len({line for _, line in cases}) == 300
    # Interleave audio families so all executors receive varied hooks and voices.
    groups = {audio: [line.strip() for line in text.splitlines() if line.strip()] for audio, text in HOOKS.items()}
    cases = [(audio, groups[audio][i]) for i in range(43) for audio in groups if i < len(groups[audio])]
    specification = json.loads(Path(a.spec).read_text(encoding='utf-8-sig')) if a.spec else None
    if specification is not None:
        if not specification or any(not item.get('recipe_prompt') for item in specification):
            raise ValueError('New batches require full recipe prompts for every pair.')
        cases = [(item['audio_name'], item['hook_idea']) for item in specification]
        if len({event for _, event in cases}) != len(cases):
            raise ValueError('Duplicate hook idea in new specification.')
        if len({item['recipe_prompt'] for item in specification}) != len(cases):
            raise ValueError('Duplicate recipe prompt in new specification.')
        if any(not (Path(a.audios)/(audio+'.mp3')).is_file() for audio, _ in cases):
            raise ValueError('An assigned narration is missing.')
    layouts = [
        'A dedicated breakfast preparation nook near a large doorway; foreground diagonal view; architecture and furnishings freshly varied.',
        'A broad clean food-preparation island on the opposite side of the described location, with a different room layout and wide side window; do not copy the breakfast nook.',
        'A separate sheltered annex overlooking the described location, with its own broad preparation table and structural beams visible; distinct architecture, not a recolor of the other room.'
    ]
    pairs = []
    for index, (audio, event) in enumerate(cases):
        pair_id = f'{index+a.id_start:03d}'
        scene = catalog[index % len(catalog)]
        layout = layouts[(index // len(catalog)) % len(layouts)]
        recipe_prompt = base + '\nASSIGNED DISTINCT SCENE:\n' + scene['environment'] + '\n' + layout + '\nSURFACE: ' + scene['surface'] + '\nLIGHTING: ' + scene['lighting'] + '\nSLEEVES: ' + scene['sleeves'] + '\nThis is a fresh independently generated photograph, not a modification or reuse of another batch image.'
        if specification is not None:
            recipe_prompt = specification[index]['recipe_prompt']
        hook_prompt = 'Use case: photorealistic-natural. Generate ONE individual full-bleed portrait 9:16 iPhone UGC photograph, 1152x2048 requested. A staged, humorous, immediately readable visual hook for a short video. All characters are fictional American adults aged 55-75, fully clothed in everyday opaque clothing. No nudity or intimate acts. Show exactly the instant immediately BEFORE this event begins, objects already in position so motion can start in the first frame:\n' + event + '\nUse a close or medium view making the central object and expression obvious on a phone screen. Plausible anatomy and physical contact, ordinary home texture. Do not depict the entire event as a collage, no before/after, no overlay words or captions, no watermark. Give this scene its own faces, domestic setting and prop design. No shared image references or reused frames.'
        action = 'Animate this exact initial image for six seconds at ordinary real speed. Begin visible motion at frame zero and complete the core event by 2.5 seconds: ' + event + ' Preserve source actors, clothing, objects, background and framing. After the event settle naturally without a second gag. No setup pause, slow motion, cuts, speech, captions, music or lip-sync. All adults remain fully clothed. Only quiet natural ambient sound.'
        atomic(root/f'presets/{pair_id}_hook.json', dict(version=1, model='lower', seconds=6, prompts=[action]))
        pairs.append(dict(id=pair_id, audio=str(Path(a.audios).resolve()/(audio+'.mp3')), audio_name=audio,
                          hook_idea=event, chat_number=index//a.pairs_per_chat+1, style=index%3,
                          images=dict(recipe=dict(id=pair_id+'_recipe',prompt=recipe_prompt),hook=dict(id=pair_id+'_hook',prompt=hook_prompt))))
    chat_count = (len(pairs)+a.pairs_per_chat-1)//a.pairs_per_chat
    for number in range(1, chat_count+1):
        selected = pairs[(number-1)*a.pairs_per_chat:number*a.pairs_per_chat]
        slots = [dict(id=p['images'][kind]['id'],pair_id=p['id'],kind=kind,prompt=p['images'][kind]['prompt']) for p in selected for kind in ('recipe','hook')]
        atomic(root/f'chats/chat_{number:02d}/job.json', dict(root=str(root),chat_number=number,visual_review=False,slots=slots))
    manifest = dict(version=1, batch_name=root.name, root=str(root),destination=str(Path(a.destination).resolve()),
                    quantity=len(pairs), image_quantity=len(pairs)*2, chats=chat_count,pairs_per_chat=a.pairs_per_chat,flow_parallel=20,
                    account_email='bassi.volkov@gmail.com',flow_home=a.home,
                    visual_review=False,quality_regeneration=False,long_voice='slow_recipe',pairs=pairs)
    atomic(root/'manifest.json', manifest)
    print(json.dumps(dict(manifest=str(root/'manifest.json'),pairs=len(pairs),images=len(pairs)*2,chats=chat_count,flow_parallel=20)))


if __name__ == '__main__':
    main()
